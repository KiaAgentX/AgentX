"""تست بازیابی بکاپ دیتابیس — ریشهٔ باگ «file is not a database» (multipart پنل)."""
import io
import os
import sqlite3
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('WEB_PASSWORD', 'pw-restore')
os.environ.setdefault('WEB_SECRET', 'r' * 32)
os.environ.setdefault('ADMIN_IDS', '1')

import pytest_asyncio

_HDR = {'X-Requested-With': 'fetch'}


def _db_bytes() -> bytes:
    import tempfile
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    try:
        con = sqlite3.connect(path)
        con.executescript("""
            CREATE TABLE users (
                user_id INTEGER PRIMARY KEY, username TEXT,
                credits INTEGER DEFAULT 0, total_earned INTEGER DEFAULT 0,
                total_spent INTEGER DEFAULT 0, products_sold INTEGER DEFAULT 0,
                created_at REAL, is_banned INTEGER DEFAULT 0);
            CREATE TABLE products (
                id INTEGER PRIMARY KEY, creator_id INTEGER, title TEXT);
            INSERT INTO users (user_id, username) VALUES (42, 'old_user');
        """)
        con.commit()
        con.close()
        with open(path, 'rb') as f:
            return f.read()
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def _zip_bytes(payload: bytes, name: str = 'marketplace.db') -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, payload)
    return buf.getvalue()


@pytest_asyncio.fixture
async def client(tmp_path):
    from fastapi.testclient import TestClient

    import database
    import web_admin
    from config import config as cfg
    old_db = database.DB_PATH
    database.DB_PATH = str(tmp_path / 'restore.db')
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


def test_restore_raw_db_ok(client):
    """آپلود مستقیم فایل .db (بدون multipart مشکل‌ساز قدیمی)."""
    _admin(client)
    r = client.post('/api/admin/restore-db',
                    files={'file': ('marketplace.db', _db_bytes())},
                    headers=_HDR)
    assert r.status_code == 200, r.text
    assert r.json()['ok'] is True
    import database
    pending = os.path.join(os.path.dirname(os.path.abspath(database.DB_PATH)),
                           'restore-pending.db')
    assert os.path.exists(pending), 'باید restore-pending.db ساخته شود'


def test_restore_zip_auto_unpacked(client):
    """اگر zip آپلود شود، .db داخلش خودکار استخراج و صف می‌شود."""
    _admin(client)
    payload = _zip_bytes(_db_bytes(), name='old/marketplace-20260924-0400.db')
    r = client.post('/api/admin/restore-db',
                    files={'file': ('backup.zip', payload)}, headers=_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['ok'] is True
    assert 'marketplace-20260924-0400.db' in body['message']


def test_restore_rejects_non_db(client):
    """فایل غیر-SQLite با پیام راهنمای فارسی رد می‌شود (نه traceback انگلیسی)."""
    _admin(client)
    r = client.post('/api/admin/restore-db',
                    files={'file': ('notes.txt', b'this is not a database')},
                    headers=_HDR)
    assert r.status_code == 400
    detail = r.json()['detail']
    assert 'SQLite' in detail and 'zip' in detail


def test_restore_requires_admin(client):
    r = client.post('/api/admin/restore-db',
                    files={'file': ('x.db', _db_bytes())}, headers=_HDR)
    assert r.status_code == 401
