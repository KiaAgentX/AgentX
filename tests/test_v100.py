"""تست‌های 1.0.0 «تک»: هاب شیشه‌ای لینک‌ها + گیت ادمین + alias خروجی CSV"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('WEB_PASSWORD', 'pw-100')
os.environ.setdefault('WEB_SECRET', 'o' * 32)
os.environ.setdefault('ADMIN_IDS', '8198598635')
os.environ.setdefault('BOT_USERNAME', 'TestBotX')
os.environ.setdefault('SUPPORT_CONTACT', '@TestSupport')

import pytest_asyncio


@pytest_asyncio.fixture
async def client(tmp_path):
    from fastapi.testclient import TestClient

    import database
    import web_admin
    from config import config as cfg
    old_db = database.DB_PATH
    database.DB_PATH = str(tmp_path / 't100.db')
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


def test_links_page_public(client):
    """هاب شیشه‌ای: بدون لاگین — بخش کاربران + کارت ورود ادمین، بدون لینک‌های ادمین."""
    r = client.get('/links')
    assert r.status_code == 200
    h = r.text
    assert 'backdrop-filter' in h, 'استایل شیشه‌ای نیست'
    from config import config as _cfg
    sup = (_cfg.SUPPORT_CONTACT or '@ImXforever').lstrip('@')
    assert 't.me/TestBotX' in h, 'یوزرنیم بات تزریق نشد'
    assert f't.me/{sup}' in h, 'پشتیبانی تزریق نشد'
    for path in ('/shop', '/landing', '/showcase3d'):
        assert f'href="{path}"' in h
    assert 'href="/admin"' not in h, 'لینک ادمین نباید قبل از لاگین باشد'
    assert '/login' in h, 'کارت ورود ادمین باید باشد'


def test_links_page_admin_section(client):
    """بعد از لاگین، کارت‌های ادمین ظاهر می‌شوند."""
    _admin(client)
    h = client.get('/links').text
    for path in ('/admin', '/insights', '/live', '/cockpit', '/api/admin/backup',
                 '/api/admin/export/users.csv'):
        assert f'href="{path}"' in h, f'لینک ادمین {path} غایب است'
    assert 'href="/login"' not in h


def test_every_hub_link_resolves(client):
    """هیچ لینک مرده‌ای در هاب: همهٔ مسیرهای محلی با کوکی ادمین ۲۰۰ می‌دهند."""
    _admin(client)
    h = client.get('/links').text
    hrefs = set(re.findall(r'href="(/[^"]+)"', h))
    assert hrefs, 'هیچ لینک محلی در هاب نیست'
    for p in sorted(hrefs):
        r = client.get(p)
        assert r.status_code == 200, f'{p} → {r.status_code} (لینک مرده در هاب)'


def test_export_csv_alias(client):
    """۱.۰.۰: پسوند .csv هم قبول است (فیکس لینک insights)."""
    _admin(client)
    assert client.get('/api/admin/export/users.csv').status_code == 200
    assert client.get('/api/admin/export/users').status_code == 200


def test_storefront_hub_button(client):
    """دکمهٔ شیشه‌ای 🔗 در فروشگاه + استایل آن."""
    h = client.get('/shop').text
    assert 'href="/links"' in h and 'hub-link' in h


def test_admin_nav_links_button():
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'web', 'admin.html'), encoding='utf-8').read()
    assert "location.href='/links'" in src


def test_version_100(client):
    """قرارداد نسخه: /healthz همیشه با config.VERSION هم‌خوان است و از 1.0.0
    جلوتر نمی‌ماند. (پین دقیق «1.0.0» از v2.0.0 «تک» به بعد کهنه بود و
    حتی قبل از 2.1.0 هم قرمز بود — حالا هم‌خوانی + حداقل نسخه چک می‌شود.)"""
    h = client.get('/healthz').json()
    from config import VERSION, config
    assert h['version'] == VERSION
    assert config.VERSION == VERSION
    assert tuple(int(p) for p in VERSION.split('.')) >= (1, 0, 0)
