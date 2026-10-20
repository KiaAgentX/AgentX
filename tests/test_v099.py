"""تست‌های 0.9.9 «روژن»: موتور تحلیل رشد، داشبورد، CSV، هفته‌نامه، پک ۱۶ مهارتی"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('WEB_PASSWORD', 'pw-099')
os.environ.setdefault('WEB_SECRET', 'r' * 32)
os.environ.setdefault('ADMIN_IDS', '8198598635')

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def isolated_db(tmp_path):
    import database
    from config import config as cfg
    old_db = database.DB_PATH
    database.DB_PATH = str(tmp_path / 't099.db')
    cfg.DB_PATH = database.DB_PATH
    await database.init_db()
    yield
    async def _close():
        if database._DB is not None:
            await database._DB.close()
            database._DB = None
            database._DB_SRC = None
    await _close()
    database.DB_PATH = old_db
    cfg.DB_PATH = old_db


@pytest_asyncio.fixture
async def client():
    from fastapi.testclient import TestClient

    import web_admin
    with TestClient(web_admin.build_app()) as c:
        yield c


def _admin(client):
    r = client.post('/api/login', json={'password': os.environ['WEB_PASSWORD']})
    assert r.status_code == 200   # TestClient کوکی را خودش نگه می‌دارد


async def _seed_insights(db_path):
    """دادهٔ کنترل‌شده: ۳ کاربر جدید امروز، ۲ فعال امروز، ۱ خرید امروز به ۳۰۰ کردیت."""
    import time

    import aiosqlite
    now = time.time()
    con = await aiosqlite.connect(db_path)
    await con.execute("INSERT INTO users (user_id, username, first_name, credits, created_at, last_seen) VALUES (9001,'a','A',0,?,?)", (now - 3600, now - 600))
    await con.execute("INSERT INTO users (user_id, username, first_name, credits, created_at, last_seen) VALUES (9002,'b','B',0,?,?)", (now - 7200, now - 1200))
    await con.execute("INSERT INTO users (user_id, username, first_name, credits, created_at, last_seen) VALUES (9003,'c','C',0,?,0)", (now - 10800,))
    await con.execute("INSERT INTO users (user_id, username, first_name, credits, created_at, last_seen) VALUES (9004,'d','D',0,?,?)", (now - 20 * 86400, now - 21 * 86400))
    await con.execute(
        "INSERT INTO products (id, creator_id, title, price_credits, category, status, is_active, sales_count) "
        "VALUES (7001, 9001, 'پک تحلیل', 300, 'ai', 'approved', 1, 1)")
    await con.execute(
        "INSERT INTO purchases (buyer_id, product_id, price_credits, created_at, purchased_at) "
        "VALUES (9002, 7001, 300, ?, ?)", (now - 1800, now - 1800))
    await con.commit()
    await con.close()


@pytest.mark.asyncio
async def test_insights_engine_math(isolated_db):
    import database as db
    await _seed_insights(db.DB_PATH)
    s = await db.insights_series(14)
    assert len(s['days']) == 14 and len(s['gmv']) == 14
    assert s['new_users'][-1] == 3, 'امروز ۳ کاربر جدید'
    assert s['active'][-1] == 2, 'امروز ۲ کاربر فعال'
    assert s['sales'][-1] == 1 and s['gmv'][-1] == 300
    t = await db.insights_totals()
    assert t['users'] == 4 and t['new7'] == 3 and t['active7'] == 2
    assert t['sales14'] == 1 and t['gmv14'] == 300 and t['aov'] == 300.0
    assert t['top_products'] and t['top_products'][0]['title'] == 'پک تحلیل'
    assert t['top_categories'][0]['category'] == 'ai'


@pytest.mark.asyncio
async def test_weekly_top_sellers(isolated_db):
    import database as db
    await _seed_insights(db.DB_PATH)
    tops = await db.weekly_top_sellers(5)
    assert tops and tops[0]['uid'] == 9001 and tops[0]['sales'] == 1 and tops[0]['gmv'] == 300
    assert tops[0]['name'] == 'A'


def test_weekly_digest_due_logic():
    """شنبه (weekday=5) و هنوز ارسال نشده → True؛ بقیهٔ روزها False."""
    from datetime import datetime

    from cron_jobs import _weekly_digest_due
    sat = datetime(2026, 8, 29)   # شنبه
    sun = datetime(2026, 8, 30)
    assert _weekly_digest_due(sat, '') is True
    assert _weekly_digest_due(sat, '2026-08-29') is False   # امروز فرستاده
    assert _weekly_digest_due(sun, '') is False             # یکشنبه نه


@pytest.mark.asyncio
async def test_insights_endpoint_and_page(client, isolated_db):
    import database
    await _seed_insights(database.DB_PATH)
    r = client.get('/api/admin/insights')
    assert r.status_code == 401, 'بدون کوکی باید ۴۰۱ باشد'
    _admin(client)
    r = client.get('/api/admin/insights')
    assert r.status_code == 200
    d = r.json()
    assert set(d.keys()) == {'series', 'totals'}
    assert d['totals']['users'] == 4
    # صفحهٔ تحلیل با کوکی ادمین → 200
    assert client.get('/insights').status_code == 200


@pytest.mark.asyncio
async def test_csv_exports(client, isolated_db):
    import database
    await _seed_insights(database.DB_PATH)
    _admin(client)
    r = client.get('/api/admin/export/users')
    assert r.status_code == 200
    assert r.text.startswith('\ufeffuser_id,'), 'BOM + هدر'
    assert '9001' in r.text
    r2 = client.get('/api/admin/export/sales')
    assert r2.status_code == 200 and 'پک تحلیل' in r2.text
    r3 = client.get('/api/admin/export/products')
    assert r3.status_code == 200
    assert client.get('/api/admin/export/nope').status_code == 404


def test_skills_pack_16():
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'skills_builtin')
    dirs = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
    assert len(dirs) == 16, f'باید ۱۶ مهارت باشد — الان {len(dirs)}'
    for d in dirs:
        body = open(os.path.join(base, d, 'SKILL.md'), encoding='utf-8').read()
        assert body.startswith('---') and 'name:' in body.split('\n')[1] + body
        assert len(body) >= 550, f'{d} خیلی کوتاه است ({len(body)})'
    for new in ('customer-retention', 'upsell-crosssell', 'telegram-ads', 'analytics-basics'):
        assert new in dirs, f'{new} غایب است'
