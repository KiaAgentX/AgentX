"""تست‌های 5.0.0 «Ultimate»: CRM لیدها — نرمال‌ساز، دی‌دوپ، استیج، API، CLI."""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('WEB_PASSWORD', 'pw-500')
os.environ.setdefault('WEB_SECRET', 's' * 32)
os.environ.setdefault('ADMIN_IDS', '1')

import pytest_asyncio

from prospects import normalize_item


# ---------- normalize (بدون DB) ----------

def test_normalize_canonical_fields():
    row, err = normalize_item({
        "business": "Pasta Fresca", "category": "Italian", "city": "London",
        "rating": "4.6", "reviews": "187", "instagram": "@pf",
        "website": None, "sourceUrl": "https://maps.example/x",
        "address": "12 Old Compton St", "phone": "+44", "notes": "family-run",
    })
    assert err == "" and row is not None
    assert row["business"] == "Pasta Fresca"
    assert row["rating"] == 4.6
    assert row["reviews"] == 187
    assert row["website"] is None  # لید بدون سایت → null حفظ می‌شود
    assert row["source_url"].startswith("https://")


def test_normalize_aliases_case_insensitive():
    row, err = normalize_item({
        "Name": "Bella Caffe", "Cuisine": "Coffee", "Area": "London",
        "Stars": 4.3, "IG": "@bella", "URL": "https://x", "title": "ignored-if-name-present",
    })
    assert err == "" and row is not None
    assert row["business"] == "Bella Caffe"
    assert row["category"] == "Coffee"
    assert row["city"] == "London"
    assert row["rating"] == 4.3
    assert row["instagram"] == "@bella"


def test_normalize_rejects_bad_records():
    assert normalize_item("not-a-dict")[0] is None
    assert normalize_item({"city": "London"})[0] is None        # بدون نام
    assert normalize_item({"business": "X"})[0] is None          # بدون شهر
    row, err = normalize_item({"business": "X", "city": "Y", "rating": 9})
    assert row is None and "0 and 5" in err


# ---------- data layer ----------

async def test_import_dedupe_and_stats(isolated_db):
    import prospects
    payload = [
        {"business": "Pasta Fresca", "city": "London", "rating": 4.6, "reviews": 187},
        {"name": "Pasta Fresca", "area": "London"},   # تکراری (business+city)
        {"business": "Bella Caffe", "city": "London"},
        {"business": "", "city": "Nowhere"},           # نامعتبر
    ]
    res = await prospects.import_leads(payload)
    assert res["created"] == 2
    assert res["duplicates"] == 1
    assert res["skipped"] == 1
    assert res["errors"], "خطای رکورد نامعتبر باید گزارش شود"

    stats = await prospects.crm_stats()
    assert stats["total"] == 2 and stats["new"] == 2

    items = await prospects.list_prospects()
    assert {i["business"] for i in items} == {"Pasta Fresca", "Bella Caffe"}

    pid = items[0]["id"]
    assert await prospects.set_stage(pid, "warm") is True
    assert await prospects.set_stage(pid, "hacked") is False
    assert (await prospects.crm_stats())["warm"] == 1
    assert await prospects.set_stage(999999, "won") is False


# ---------- web API ----------

@pytest_asyncio.fixture
async def client(tmp_path):
    from fastapi.testclient import TestClient

    import database
    import web_admin
    from config import config as cfg
    old_db = database.DB_PATH
    database.DB_PATH = str(tmp_path / 'v500.db')
    cfg.DB_PATH = database.DB_PATH
    with TestClient(web_admin.build_app()) as c:
        yield c
    if database._DB is not None:
        await database._DB.close()
        database._DB = None
        database._DB_SRC = None
    database.DB_PATH = old_db
    cfg.DB_PATH = old_db


def _admin(client):
    r = client.post('/api/login', json={'password': os.environ['WEB_PASSWORD']})
    assert r.status_code == 200


_HDR = {'x-requested-with': 'fetch'}


def test_crm_page_needs_admin(client):
    r = client.get('/crm', follow_redirects=False)
    assert r.status_code == 302 and '/login' in r.headers['location']
    _admin(client)
    r = client.get('/crm')
    assert r.status_code == 200 and 'CRM' in r.text


def test_prospects_api_401_without_login(client):
    assert client.get('/api/prospects').status_code == 401
    r = client.post('/api/hermes/import', json=[], headers=_HDR)
    assert r.status_code == 401


def test_hermes_import_and_stage_flow(client):
    _admin(client)
    payload = [
        {"business": "Pasta Fresca", "city": "London", "rating": 4.6, "reviews": 187,
         "sourceUrl": "https://maps.example/1"},
        {"business": "Pasta Fresca", "city": "London"},       # تکراری
        {"name": "Bella Caffe", "area": "London", "stars": 4.3},
    ]
    # شکل آرایهٔ خام (قرارداد War Machine)
    r = client.post('/api/hermes/import', json=payload, headers=_HDR)
    assert r.status_code == 200, r.text
    assert r.json()['created'] == 2 and r.json()['duplicates'] == 1

    # شکل {"items": [...]}
    r = client.post('/api/hermes/import', json={"items": payload}, headers=_HDR)
    assert r.status_code == 200
    # هر ۳ آیتم (۲× Pasta Fresca تکراری در خود payload + Bella) از قبل هستند
    assert r.json()['created'] == 0 and r.json()['duplicates'] == 3

    r = client.get('/api/prospects', headers=_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data['stats']['total'] == 2
    pid = data['items'][0]['id']

    r = client.post(f'/api/prospects/{pid}/stage', json={'stage': 'won'}, headers=_HDR)
    assert r.status_code == 200 and r.json()['stage'] == 'won'
    r = client.post(f'/api/prospects/{pid}/stage', json={'stage': 'nope'}, headers=_HDR)
    assert r.status_code == 404

    # بدون هدر origin (کوکی ادمین) → CSRF رد می‌شود
    r = client.post('/api/hermes/import', json=[])
    assert r.status_code == 403


def test_crm_token_header(client):
    """ایمپورت بدون کوکی، با x-crm-token (مسیر اسکریپت/CLI)."""
    os.environ['CRM_TOKEN'] = 'tok-500-very-secret'
    try:
        r = client.post('/api/hermes/import',
                        json=[{"business": "Token Cafe", "city": "London"}],
                        headers={'x-crm-token': 'tok-500-very-secret'})
        assert r.status_code == 200 and r.json()['created'] == 1

        r = client.post('/api/hermes/import', json=[],
                        headers={'x-crm-token': 'wrong'})
        assert r.status_code == 401
    finally:
        os.environ.pop('CRM_TOKEN', None)


def test_bad_payload_rejected(client):
    _admin(client)
    r = client.post('/api/hermes/import',
                    json={"nope": True}, headers=_HDR)
    assert r.status_code == 400
    r = client.post('/api/hermes/import',
                    data='{not json', headers={**_HDR, 'Content-Type': 'application/json'})
    assert r.status_code == 400


# ---------- CLI ----------

def test_validate_leads_cli(tmp_path):
    good = tmp_path / 'leads.json'
    good.write_text(json.dumps([
        {"business": "A", "city": "London", "rating": 4.5},
        {"name": "B", "area": "London"},
    ]), encoding='utf-8')
    out = tmp_path / 'clean.json'
    script = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'tools_validate_leads.py')
    p = subprocess.run([sys.executable, script, str(good), '--out', str(out), '--json'],
                       capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    rep = json.loads(p.stdout)
    assert rep['valid'] == 2 and rep['invalid'] == 0
    assert len(json.loads(out.read_text(encoding='utf-8'))) == 2

    bad = tmp_path / 'bad.json'
    bad.write_text(json.dumps([{"city": "Nowhere"}]), encoding='utf-8')
    p = subprocess.run([sys.executable, script, str(bad), '--json'],
                       capture_output=True, text=True)
    assert p.returncode == 1
    assert json.loads(p.stdout)['invalid'] == 1
