"""Web Dashboard + Storefront — FastAPI layer over the bot's SQLite brain.

Routes:
    /                     → public storefront (catalog, product pages, leaderboard)
    /admin                → admin dashboard SPA (login-gated)
    /login                → password login (WEB_PASSWORD)
    /api/pub/*            → public JSON (catalog, product, leaderboard, info)
    /api/admin/*          → admin JSON (stats, moderation, finance, users, broadcast)
    /media/{file}         → safely serve files from UPLOAD_DIR

Enabled when WEB_PORT is set (bot.py starts it in-process so it shares the
database singleton and the aiogram Bot instance for broadcast/notifications).
Standalone run:  python web_admin.py
"""

import asyncio
import hashlib
import hmac
import logging
import os
import shutil
import tempfile
import time
import zipfile

logger = logging.getLogger(__name__)

from config import config

_BOT = None          # aiogram Bot instance when started from bot.py
_APP = None          # FastAPI app cache
_bcast_busy = False


# ---------- helpers ----------

def _secret() -> bytes:
    raw = os.getenv("WEB_SECRET") or os.getenv("BOT_TOKEN") or "hermes-marketplace-dev-secret"
    if not os.getenv("WEB_SECRET") and not os.getenv("BOT_TOKEN"):
        logger.warning("WEB_SECRET/BOT_TOKEN تنظیم نیست — کوک‌های توسعه ناامن هستند.")
    return hashlib.sha256(raw.encode()).digest()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def _secret_is_default() -> bool:
    """F8-0.6.0: WEB_SECRET و BOT_TOKEN هر دو خالی → امضا با رشتهٔ معروف dev → کوکی جعل‌پذیر."""
    return not os.getenv("WEB_SECRET") and not os.getenv("BOT_TOKEN")


def _admin_sign(payload: str) -> str:
    """F9-0.6.0: امضای توکن ادمین مقید به WEB_PASSWORD — عوض‌کردن رمز همهٔ
    نشست‌های ادمینِ قبلی را بی‌اعتبار می‌کند (توکن دزدی با تغییر رمز می‌میرد)."""
    key = hashlib.sha256(_secret() + b"::admin::" + os.getenv("WEB_PASSWORD", "").encode()).digest()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def _cookie_secure() -> bool:
    # پیش‌فرض ۰: روی HTTP ساده (http://IP:8080) کوکی Secure توسط مرورگر دور ریخته می‌شود
    # و لاگین ادمین بی‌پایان می‌شد. پشت TLS مقدار COOKIE_SECURE=1 بده.
    return os.getenv("COOKIE_SECURE", "0") == "1"


def _make_token() -> str:
    payload = f"admin.{int(time.time()) + 7 * 24 * 3600}"
    return f"{payload}.{_admin_sign(payload)}"


def _verify_token(tok: str) -> bool:
    try:
        payload, sig = tok.rsplit(".", 1)
        if not hmac.compare_digest(_admin_sign(payload), sig):
            return False
        role, exp = payload.split(".")
        return role == "admin" and int(exp) > time.time()
    except Exception:
        return False


def _local_midnight() -> int:
    today = time.strftime("%Y-%m-%d")
    return int(time.mktime(time.strptime(today, "%Y-%m-%d")))


def _day_key(epoch: float) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(epoch))


_login_fails: dict[str, tuple[int, float]] = {}


def _rate_ok(ip: str) -> bool:
    now = time.time()
    cnt, ts = _login_fails.get(ip, (0, now))
    if now - ts > 60:
        cnt = 0
    return cnt < 5


def _rate_fail(ip: str):
    now = time.time()
    cnt, ts = _login_fails.get(ip, (0, now))
    if now - ts > 60:
        cnt = 0
    _login_fails[ip] = (cnt + 1, now)


def _media_url(path: str | None) -> str | None:
    """Map an uploads path (root or subdirectory) to a safe /media URL."""
    if not path:
        return None
    up = os.path.abspath(config.UPLOAD_DIR)
    rel = os.path.relpath(os.path.abspath(path), up).replace("\\", "/")
    if not rel.startswith("..") and os.path.isfile(os.path.join(up, *rel.split("/"))):
        return f"/media/{rel}"
    # legacy: bare filename living in the uploads root
    base = os.path.basename(path.replace("\\", "/"))
    if base and os.path.isfile(os.path.join(up, base)):
        return f"/media/{base}"
    return None


def _prod_json(p: dict, public: bool = False) -> dict:
    p = dict(p)
    p["photo_url"] = _media_url(p.get("photo_path") or p.get("preview_path"))
    if not p.get("price_usd"):
        p["price_usd"] = round((p.get("price_credits") or 0) / max(1, config.CREDITS_PER_USDT), 2)
    if public:
        # Never expose filesystem paths or downloadable product locations in a
        # public catalog. Delivery is handled by the protected media route.
        for key in ("file_path", "preview_path", "photo_path", "img_main",
                    "img_feed", "img_story"):
            p.pop(key, None)
    return p


def _app_uid_from_request(request) -> int | None:
    """Validate the signed Mini App cookie/bearer without importing a closure."""
    token = (request.headers.get("authorization", "").removeprefix("Bearer ").strip()
             or request.cookies.get("happ", ""))
    try:
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(_sign(payload), sig):
            return None
        role, uid, exp = payload.split(".")
        if role != "app" or int(exp) < time.time():
            return None
        return int(uid)
    except Exception:
        return None


def _is_private_ip(ip: str) -> bool:
    import ipaddress as _ip
    try:
        return _ip.ip_address(ip).is_private
    except ValueError:
        return False


# ---------- app factory ----------

def build_app():
    global _APP
    if _APP is not None:
        return _APP

    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
    from pydantic import BaseModel
    from starlette.background import BackgroundTask

    WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

    def _brand_html(fname: str) -> str:
        """v2.1.0 «روز اول»: read a page template and resolve whitelabel
        brand tokens ({{BRAND_NAME}} / {{BRAND_TAGLINE}} / {{BRAND_FOOTER}})
        from env — so a prospect demo boots as "their" shop, zero code edits."""
        with open(os.path.join(WEB_DIR, fname), "r", encoding="utf-8") as f:
            page = f.read()
        return (
            page
            .replace("{{BRAND_NAME}}", config.display_name)
            .replace("{{BRAND_TAGLINE}}", config.brand_tagline)
            .replace("{{BRAND_FOOTER}}", config.brand_footer)
        )

    app = FastAPI(title=f"{config.display_name} Web", docs_url=None, redoc_url=None)
    _APP = app

    # ----- auth -----

    def _is_admin(request: Request) -> bool:
        return _verify_token(request.cookies.get("hweb", ""))

    def _guard(request: Request):
        if not _is_admin(request):
            raise HTTPException(401, "unauthorized")
        if request.method == "POST":
            if request.headers.get("x-requested-with") != "fetch":
                raise HTTPException(403, "bad origin")

    class LoginIn(BaseModel):
        password: str = ""

    @app.post("/api/login")
    async def login(request: Request, body: LoginIn):
        ip = request.client.host if request.client else "?"
        if not _rate_ok(ip):
            raise HTTPException(429, "too many attempts")
        pw = os.getenv("WEB_PASSWORD", "")
        if not pw:
            raise HTTPException(503, "WEB_PASSWORD تنظیم نشده است")
        if not hmac.compare_digest(body.password, pw):
            _rate_fail(ip)
            raise HTTPException(401, "رمز اشتباه است")
        if _secret_is_default():
            raise HTTPException(503, "WEB_SECRET تنظیم نشده — کوکی امن ممکن نیست. WEB_SECRET را در .env ست کن.")
        resp = JSONResponse({"ok": True})
        resp.set_cookie("hweb", _make_token(), max_age=7 * 24 * 3600,
                        httponly=True, samesite="lax", secure=_cookie_secure(), path="/")
        return resp

    @app.post("/api/logout")
    async def logout():
        resp = JSONResponse({"ok": True})
        resp.delete_cookie("hweb", path="/")
        return resp

    @app.get("/api/me")
    async def me(request: Request):
        return {"admin": _is_admin(request),
                "password_set": bool(os.getenv("WEB_PASSWORD", ""))}

    # ----- pages -----

    @app.get("/legacy-home")
    async def page_storefront():
        return FileResponse(os.path.join(WEB_DIR, "storefront.html"))

    @app.get("/admin")
    async def page_admin(request: Request):
        if not _is_admin(request):
            return RedirectResponse("/login", 302)
        return FileResponse(os.path.join(WEB_DIR, "admin.html"))

    @app.get("/insights")
    async def page_insights(request: Request):
        if not _is_admin(request):
            return RedirectResponse("/login", 302)
        return FileResponse(os.path.join(WEB_DIR, "insights.html"))

    _LINKS_TMPL = os.path.join(WEB_DIR, "links.html")

    @app.get("/links")
    async def page_links(request: Request):
        """۱.۰.۰ «تک»: هاب شیشه‌ای همهٔ آدرس‌های پلتفرم — کاربر/ادمین."""
        from fastapi.responses import HTMLResponse
        page_html = open(_LINKS_TMPL, encoding="utf-8").read()
        bot = (os.getenv("BOT_USERNAME", "") or "DropAgentXBot").strip().lstrip("@")
        sup = (config.SUPPORT_CONTACT or "@ImXforevr").strip().lstrip("@")
        if _is_admin(request):
            admin_section = '''
<div class="grid">
  <a class="glass c-gold" href="/admin">
    <span class="ic">📊</span>
    <span class="tx"><span class="t">پنل ادمین</span><span class="d">داشبورد، مودریشن، مالی</span></span>
    <span class="go">←</span>
  </a>
  <a class="glass c-gold" href="/insights">
    <span class="ic">📈</span>
    <span class="tx"><span class="t">تحلیل روژن</span><span class="d">نمودار رشد ۱۴ روزه + CSV</span></span>
    <span class="go">←</span>
  </a>
  <a class="glass c-gold" href="/live">
    <span class="ic">🔴</span>
    <span class="tx"><span class="t">داشبورد زنده</span><span class="d">استریم لحظه‌ای رویدادها</span></span>
    <span class="go">←</span>
  </a>
  <a class="glass c-gold" href="/cockpit">
    <span class="ic">🧠</span>
    <span class="tx"><span class="t">کاکپیت هرمس</span><span class="d">چت مستقیم با موتور AI</span></span>
    <span class="go">←</span>
  </a>
  <a class="glass c-gold" href="/api/admin/backup">
    <span class="ic">💾</span>
    <span class="tx"><span class="t">بکاپ دیتابیس</span><span class="d">دانلود فوری SQLite</span></span>
    <span class="go">←</span>
  </a>
  <a class="glass c-gold" href="/api/admin/export/users.csv">
    <span class="ic">📤</span>
    <span class="tx"><span class="t">خروجی CSV کاربران</span><span class="d">سازگار با اکسل فارسی</span></span>
    <span class="go">←</span>
  </a>
</div>'''
        else:
            admin_section = '''
<div class="grid">
  <a class="glass" href="/login">
    <span class="ic">🔐</span>
    <span class="tx"><span class="t">ورود ادمین</span><span class="d">پنل، تحلیل و ابزارهای مدیریت</span></span>
    <span class="go">←</span>
  </a>
</div>
<p class="note">بخش ادمین پس از ورود نمایش داده می‌شود.</p>'''
        page_html = (page_html.replace("__BOT__", bot)
                              .replace("__SUPPORT__", sup)
                              .replace("__ADMIN_SECTION__", admin_section))
        return HTMLResponse(page_html)

    @app.get("/login")
    async def page_login():
        return FileResponse(os.path.join(WEB_DIR, "login.html"))

    # ----- SenPai cockpit (admin-only AI chat cockpit, client-side app) -----

    @app.get("/landing")
    async def landing_page():
        from fastapi.responses import HTMLResponse
        return HTMLResponse(_brand_html("landing.html"))

    @app.get("/showcase3d")
    async def showcase3d():
        return FileResponse(os.path.join(WEB_DIR, "showcase3d.html"), media_type="text/html")

    @app.get("/live")
    async def page_live(request: Request):
        if not _is_admin(request):
            return RedirectResponse("/login", 302)
        return FileResponse(os.path.join(WEB_DIR, "live.html"))

    @app.get("/cockpit")
    async def page_cockpit(request: Request):
        if not _is_admin(request):
            return RedirectResponse("/login", 302)
        return FileResponse(os.path.join(WEB_DIR, "senpai", "app.html"))

    @app.get("/senpai/{fname}")
    async def senpai_asset(fname: str, request: Request):
        if not _is_admin(request):
            raise HTTPException(404)
        base = os.path.basename(fname)
        full = os.path.join(WEB_DIR, "senpai", base)
        if not os.path.isfile(full) or base.startswith("."):
            raise HTTPException(404)
        media = {"css": "text/css", "js": "application/javascript",
                 "html": "text/html"}.get(base.rsplit(".", 1)[-1], "application/octet-stream")
        return FileResponse(full, media_type=media)

    import app_api
    app_api.register(app)

    # ---------- global rate limiter (simple in-memory, per-IP) ----------
    _rate_store: dict = {}   # ip → [timestamps]
    _RATE_WINDOW = 60        # seconds
    _RATE_MAX = 40           # max requests per window

    _STATIC_SKIP = ("/media/", "/assets/", "/fonts/", "/vendor/", "/app/",
                    "/sw.js", "/icon.svg", "/manifest.webmanifest", "/offline.html")

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        # تست‌ها: کل سوئیت یک IP جعلی (testclient) دارد و در کمتر از یک دقیقه
        # از بودجهٔ 40/min رد می‌شود — فقط در APP_ENV=test لیمیتر خاموش است.
        if os.getenv("APP_ENV", "").lower() == "test":
            return await call_next(request)
        # F6-0.6.0: استاتیک/مدیا از سهمیهٔ 40/min خارج — یک صفحهٔ فروشگاه با بیست
        # عکس نباید کاربر عادی را 429 کند.
        if request.url.path.startswith(_STATIC_SKIP):
            return await call_next(request)
        client_ip = request.client.host if request.client else "unknown"
        # F5-0.6.0: پشت reverse-proxy همه 127.0.0.1 هستند → سهمیهٔ مشترک، یعنی یک
        # مهاجم کل IP را قفل می‌کند. فقط وقتی اتصال از IP پرایوت است به اولین hop
        # معتبر X-Forwarded-For اعتماد می‌کنیم (تست مستقیم جعل XFF بی‌اثر است).
        if _is_private_ip(client_ip):
            xff = request.headers.get("x-forwarded-for", "")
            first = xff.split(",")[0].strip() if xff else ""
            if first and not _is_private_ip(first):
                client_ip = first
        now = time.time()
        # clean old entries
        if client_ip in _rate_store:
            _rate_store[client_ip] = [
                t for t in _rate_store[client_ip] if now - t < _RATE_WINDOW
            ]
            if len(_rate_store[client_ip]) >= _RATE_MAX:
                return __import__("fastapi").responses.JSONResponse(
                    {"detail": "تعداد درخواست‌ها زیاد است — چند ثانیه صبر کن"},
                    status_code=429,
                )
            _rate_store[client_ip].append(now)
        else:
            _rate_store[client_ip] = [now]
        # periodic cleanup (every 1000 requests)
        if len(_rate_store) > 500:
            cutoff = time.time() - _RATE_WINDOW
            stale = [ip for ip, ts in _rate_store.items()
                     if not ts or ts[-1] < cutoff]
            for ip in stale:
                del _rate_store[ip]
        response = await call_next(request)
        return response

    # ---------- DropAgentX Mini App shell + static ----------
    APP_DIR = os.path.join(WEB_DIR, "app")

    @app.get("/")
    async def page_miniapp():
        return FileResponse(os.path.join(APP_DIR, "index.html"))

    @app.get("/shop")
    async def page_shop_legacy():
        return FileResponse(os.path.join(WEB_DIR, "storefront.html"))

    @app.get("/app/{fpath:path}")
    async def app_static(fpath: str):
        root = os.path.abspath(APP_DIR)
        full = os.path.abspath(os.path.join(root, fpath))
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            raise HTTPException(404)
        ext = full.rsplit(".", 1)[-1].lower()
        media = {"css": "text/css", "js": "application/javascript",
                 "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                 "svg": "image/svg+xml", "html": "text/html; charset=utf-8",
                 "woff2": "font/woff2"}.get(ext, "application/octet-stream")
        return FileResponse(full, media_type=media)

    @app.get("/media/{fpath:path}")
    async def media(fpath: str, request: Request,
                    uid: int = 0, exp: int = 0, sig: str = ""):
        """Serve public product images and authenticated purchased files only.

        v1.0.1 fixes:
        * signed shareable download links (?uid=&exp=&sig=) — the mini-app
          cookie is absent when a download URL is opened in an external
          browser/Telegram, which used to 403 legit buyers;
        * avatars/covers (files not recorded as a product's file_path) are
          served publicly instead of 404 — they could never load at all.
        """
        up = os.path.abspath(config.UPLOAD_DIR)
        full = os.path.realpath(os.path.abspath(os.path.join(up, fpath)))
        if not (os.path.normcase(full).startswith(os.path.normcase(up) + os.sep)
                and os.path.isfile(full)
                and not os.path.islink(full)):
            raise HTTPException(404)

        # Match the canonical stored path, the relative legacy form, the raw
        # URL form and the uploads-root-agnostic form. Do not use a basename
        # fallback: two users can upload the same filename.
        rel = os.path.relpath(full, os.getcwd()).replace("\\", "/")
        forms = {full, rel, fpath, f"{os.path.basename(up)}/{fpath}",
                 os.path.abspath(fpath)}
        forms.discard("")
        from database import get_db, is_product_purchased_by_user

        def _dl_authorized() -> int | None:
            # 1) mini-app cookie/bearer (same browser context)
            auth_uid = _app_uid_from_request(request)
            if auth_uid:
                return auth_uid
            # 2) signed download link issued by app_api (any browser context)
            if uid and exp and sig:
                import hashlib as _hl
                h = _hl.sha1(fpath.encode("utf-8", "ignore")).hexdigest()[:16]
                payload = f"dl.{uid}.{exp}.{h}"
                try:
                    if exp >= time.time() and hmac.compare_digest(_sign(payload), sig):
                        return uid
                except Exception:
                    pass
            return None

        async with get_db() as db:
            # Only a file recorded as a product's deliverable is gated.
            # Everything else under uploads/ (covers, previews, avatars,
            # covers uploaded from the mini-app) is public-by-design.
            marks = ",".join("?" * len(forms))
            cur = await db.execute(
                f"SELECT id FROM products WHERE file_path IN ({marks}) LIMIT 1",
                tuple(forms))
            gate = await cur.fetchone()
            if gate is None and fpath.rsplit(".", 1)[-1].lower() not in {
                    "jpg", "jpeg", "png", "webp", "gif", "svg", "avif"}:
                # Non-image that matched no stored form: make sure it is not a
                # digital deliverable recorded under a different uploads root
                # (e.g. after moving uploads onto a volume) — fail closed.
                cur = await db.execute(
                    "SELECT id, file_path FROM products "
                    "WHERE file_path IS NOT NULL AND file_path != ''")
                for pid, fp in await cur.fetchall():
                    try:
                        if os.path.abspath(str(fp)) == full:
                            gate = (pid,)
                            break
                    except Exception:
                        continue

        if gate:
            product_id = gate[0]
            auth_uid = _dl_authorized()
            if not auth_uid or not await is_product_purchased_by_user(product_id, auth_uid):
                raise HTTPException(403, "خرید محصول برای دانلود لازم است")
        return FileResponse(full)

    # ----- public API -----

    @app.get("/healthz")
    async def healthz():
        """Cheap liveness probe for Railway/uptime monitors (no auth, no PII)."""
        from config import VERSION
        return {"ok": True, "service": "hermes-marketplace",
                "version": VERSION, "time": int(time.time())}

    @app.get("/api/pub/info")
    async def pub_info():
        from database import get_db
        async with get_db() as db:
            cur = await db.execute(
                "SELECT DISTINCT category FROM products WHERE is_active=1 AND status='approved'")
            cats = [r[0] for r in await cur.fetchall()]
        return {"bot_username": os.getenv("BOT_USERNAME", ""),
                "categories": sorted(cats),
                "credits_per_usdt": config.CREDITS_PER_USDT}

    @app.get("/api/admin/doctor")
    async def admin_doctor(request: Request):
        """hermes-agent `doctor` style diagnostics — admin only.
        Checks DB integrity, AI backend config, disk space, uploads
        writability and required env vars."""
        _guard(request)
        checks: list[dict] = []

        def _chk(name: str, ok: bool, detail: str = ""):
            checks.append({"check": name, "ok": bool(ok), "detail": detail})

        # DB reachable + integrity
        try:
            from database import get_db
            async with get_db() as db:
                cur = await db.execute("PRAGMA integrity_check")
                row = await cur.fetchone()
            _chk("database", row and row[0] == "ok", str(row[0]) if row else "?")
        except Exception as e:
            from hermes_engine import redact_secrets
            _chk("database", False, redact_secrets(str(e))[:120])

        # AI backend configured?
        try:
            from hermes_engine import get_ai_config, resolve_mode
            conf = await get_ai_config()
            _chk("ai_backend", bool(conf["api_key"]),
                 f"mode={resolve_mode()} model={conf['model']}")
        except Exception as e:
            _chk("ai_backend", False, type(e).__name__)

        # uploads dir writable
        try:
            os.makedirs(config.UPLOAD_DIR, exist_ok=True)
            probe = os.path.join(config.UPLOAD_DIR, ".healthprobe")
            with open(probe, "w") as f:
                f.write("ok")
            os.remove(probe)
            _chk("uploads_writable", True)
        except Exception as e:
            _chk("uploads_writable", False, type(e).__name__)

        # free disk space on data volume
        try:
            usage = shutil.disk_usage(os.path.dirname(config.DB_PATH) or ".")
            free_gb = usage.free / 1024 ** 3
            _chk("disk_free", free_gb > 0.5, f"{free_gb:.2f} GB free")
        except Exception as e:
            _chk("disk_free", False, type(e).__name__)

        # bot token present + web password set
        _chk("bot_token", bool(config.BOT_TOKEN))
        _chk("web_password", bool(os.getenv("WEB_PASSWORD")))

        if os.getenv("TREASURY_AUTO_ENABLED", "0") == "1":
            required = {
                "wallets": all(config.DEPOSIT_WALLETS.get(k) for k in ("ton", "bsc", "sol", "trx")),
                "rpc": all(os.getenv(k) for k in ("BSC_RPC_URL", "BASE_RPC_URL", "SOL_RPC_URL")),
                "tokens": all(os.getenv(k) for k in ("USDT_BSC_TOKEN", "USDT_BASE_TOKEN", "USDT_SOL_TOKEN", "USDT_TRX_TOKEN", "USDT_TON_TOKEN")),
                "payout_provider": bool(os.getenv("PAYOUT_API_URL") and os.getenv("PAYOUT_API_TOKEN")),
            }
            for name, ok in required.items():
                _chk(f"treasury_{name}", ok)

        ok_all = all(c["ok"] for c in checks)
        return {"ok": ok_all, "checks": checks}

    # ------------------------------------------------------------------
    # v2.0.0 — Observability, identity & RL endpoints
    # ------------------------------------------------------------------

    @app.get("/api/admin/logs")
    async def admin_logs(request: Request, limit: int = 30, level: str = "",
                         user_id: int = 0, logger: str = ""):
        _guard(request)
        from database import raw_db
        q = "SELECT id, ts, level, logger, msg, user_id FROM app_logs"
        params = []
        cond = []
        if level:
            cond.append("level = ?"); params.append(level.upper())
        if user_id:
            cond.append("user_id = ?"); params.append(user_id)
        if logger:
            cond.append("logger LIKE ?"); params.append(f"%{logger}%")
        if cond:
            q += " WHERE " + " AND ".join(cond)
        q += " ORDER BY id DESC LIMIT ?"; params.append(min(limit, 200))
        async with raw_db() as db:
            cur = await db.execute(q, params)
            rows = [dict(zip(("id", "ts", "level", "logger", "msg", "user_id"), r))
                    for r in await cur.fetchall()]
        return {"ok": True, "logs": rows, "count": len(rows)}

    @app.get("/api/admin/errors")
    async def admin_errors(request: Request, since: float = 0):
        _guard(request)
        from database import raw_db
        async with raw_db() as db:
            by_logger = await db.execute(
                "SELECT logger, COUNT(*) FROM app_logs WHERE level IN ('ERROR','CRITICAL') "
                "GROUP BY logger ORDER BY 2 DESC")
            lgr = [(str(r[0]), r[1]) for r in await by_logger.fetchall()]
            recent = await db.execute(
                "SELECT id, ts, level, logger, msg, data, exc FROM app_logs "
                "WHERE level IN ('ERROR','CRITICAL') ORDER BY id DESC LIMIT 12")
            rows = [dict(zip(("id", "ts", "level", "logger", "msg", "data", "exc"), r))
                    for r in await recent.fetchall()]
        return {"ok": True, "by_logger": lgr, "recent": rows}

    @app.get("/api/admin/identity/{uid}")
    async def admin_identity(request: Request, uid: int):
        _guard(request)
        try:
            from identity_rl import get_identity
            snap = await get_identity(uid)
            return {"ok": True, "identity": snap}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @app.get("/api/admin/rl-summary")
    async def admin_rl_summary(request: Request):
        _guard(request)
        from database import raw_db
        async with raw_db() as db:
            cur = await db.execute(
                "SELECT label, COUNT(*) FROM rl_identity GROUP BY label ORDER BY 2 DESC")
            labels = [(str(r[0]), r[1]) for r in await cur.fetchall()]
        return {"ok": True, "labels": labels}

    @app.get("/api/admin/v2health")
    async def admin_v2health(request: Request):
        _guard(request)
        from config import VERSION
        flags = {
            "identity_rl": config.IDENTITY_RL_ENABLED,
            "memory2": config.MEMORY2_ENABLED,
            "image_gen_backend": config.IMAGE_GEN_BACKEND,
            "log_to_db": config.LOG_TO_DB,
            "gemini_api_set": bool(config.GEMINI_API_KEY),
        }
        return {"ok": True, "version": VERSION, "app": config.APP_NAME, "flags": flags}

    @app.get("/api/pub/catalog")
    async def pub_catalog(q: str = "", cat: str = "", limit: int = 24, offset: int = 0):
        from database import product_rating, search_products
        limit = max(1, min(limit, 60))
        items = await search_products(q.strip(), cat.strip(), limit, max(0, offset))
        out = []
        for p in items:
            stars, n = await product_rating(p["id"])
            out.append(_prod_json({**p, "stars": stars, "reviews": n}, public=True))
        return {"items": out}

    @app.get("/api/pub/product/{pid}")
    async def pub_product(pid: int):
        from database import get_product, product_rating
        p = await get_product(pid)
        if not p or not p.get("is_active") or p.get("status") != "approved":
            raise HTTPException(404)
        stars, n = await product_rating(pid)
        return {"item": _prod_json({**p, "stars": stars, "reviews": n}, public=True)}

    @app.get("/api/pub/leaderboard")
    async def pub_leaderboard():
        from database import get_leaderboard
        rows = await get_leaderboard(10)
        return {"items": [{"user_id": r["user_id"],
                           "name": r.get("first_name") or r.get("username") or "User",
                           "credits": r["credits"], "sold": r["products_sold"]}
                          for r in rows]}

    # ----- admin: stats -----

    # ----- v0.9.9 «روژن»: تحلیل رشد + خروجی CSV -----

    @app.get("/api/admin/insights")
    async def admin_insights(request: Request):
        _guard(request)
        from database import insights_series, insights_totals
        return {"series": await insights_series(14), "totals": await insights_totals()}

    @app.get("/api/admin/export/{kind}")
    async def admin_export_csv(kind: str, request: Request):
        _guard(request)
        kind = kind.removesuffix(".csv")  # ۱.۰.۰: /export/users.csv هم مثل users
        import csv as _csv
        import io as _io

        from fastapi.responses import Response

        from database import get_db
        queries = {
            "users": (
                (
                    "SELECT user_id, username, first_name, credits, is_banned, "
                    "created_at FROM users ORDER BY user_id"
                ),
                ["user_id", "username", "first_name", "credits", "is_banned", "created_at"]),
            "products": (
                (
                    "SELECT id, title, category, price_credits, sales_count, status "
                    "FROM products ORDER BY id"
                ),
                ["id", "title", "category", "price_credits", "sales_count", "status"]),
            "sales": (
                (
                    "SELECT p.id, p.buyer_id, pr.title AS product, p.price_credits, p.created_at "
                    "FROM purchases p LEFT JOIN products pr ON pr.id=p.product_id ORDER BY p.id"
                ),
                ["id", "buyer_id", "product", "price_credits", "created_at"]),
        }
        if kind not in queries:
            raise HTTPException(404)
        sql, header = queries[kind]
        async with get_db() as db:
            cur = await db.execute(sql)
            rows = await cur.fetchall()
        buf = _io.StringIO()
        w = _csv.writer(buf)
        w.writerow(header)
        for r in rows:
            w.writerow([r[k] if not isinstance(r, dict) else r.get(k, "") for k in header])
        stamp = time.strftime("%Y%m%d-%H%M")
        return Response(
            "\ufeff" + buf.getvalue(),   # BOM تا اکسل فارسی را درست نشان دهد
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="dropagentx-{kind}-{stamp}.csv"'},
        )

    @app.get("/api/admin/stats")
    async def admin_stats(request: Request):
        _guard(request)
        from database import get_db
        midnight = _local_midnight()
        d14 = midnight - 13 * 86400
        async with get_db() as db:
            async def one(sql, params=()):
                cur = await db.execute(sql, params)
                return (await cur.fetchone())[0]

            s = {
                "users_total": await one("SELECT COUNT(*) FROM users"),
                "users_new": await one("SELECT COUNT(*) FROM users WHERE created_at >= ?", (midnight,)),
                "users_banned": await one("SELECT COUNT(*) FROM users WHERE is_banned=1"),
                "products_active": await one("SELECT COUNT(*) FROM products WHERE is_active=1 AND status='approved'"),
                # NOTE: counted inline — calling database.count_pending_products() here
                # would flip the shared singleton to raw tuples for later dict(r) reads
                "products_pending": await one("SELECT COUNT(*) FROM products WHERE status='pending'"),
                "sales_total": await one("SELECT COUNT(*) FROM purchases"),
                "sales_today": await one("SELECT COUNT(*) FROM purchases WHERE purchased_at >= ?", (midnight,)),
                "volume_total": await one("SELECT COALESCE(SUM(price_credits),0) FROM purchases"),
                "volume_today": await one("SELECT COALESCE(SUM(price_credits),0) FROM purchases WHERE purchased_at >= ?", (midnight,)),
                "deposits_pending": await one("SELECT COUNT(*) FROM deposits WHERE status='pending'"),
                "withdrawals_pending": await one("SELECT COUNT(*) FROM withdrawals WHERE status='pending'"),
                "credits_circulating": await one("SELECT COALESCE(SUM(credits),0) FROM users WHERE is_banned=0"),
                "tasks_active": await one("SELECT COUNT(*) FROM tasks WHERE is_active=1"),
            }

            async def series(sql, key_cnt, key_vol):
                cur = await db.execute(sql, (d14,))
                by_day = {r[0]: (r[1], r[2]) for r in await cur.fetchall()}
                out = []
                for i in range(14):
                    day = _day_key(d14 + i * 86400)
                    c, v = by_day.get(day, (0, 0))
                    out.append({"day": day[5:], "count": c, "volume": v})
                return out

            s["sales_series"] = await series(
                "SELECT date(purchased_at,'unixepoch','localtime') d,"
                " COUNT(*), COALESCE(SUM(price_credits),0) FROM purchases"
                " WHERE purchased_at >= ? GROUP BY d", "c", "v")
            s["users_series"] = await series(
                "SELECT date(created_at,'unixepoch','localtime') d,"
                " COUNT(*), 0 FROM users"
                " WHERE created_at >= ? GROUP BY d", "c", "v")

            cur = await db.execute(
                """SELECT pc.id, pc.price_credits, pc.purchased_at,
                          pr.title, pr.category,
                          u.first_name AS buyer_name, u.username AS buyer_username
                   FROM purchases pc
                   JOIN products pr ON pr.id = pc.product_id
                   LEFT JOIN users u ON u.user_id = pc.buyer_id
                   ORDER BY pc.purchased_at DESC LIMIT 12""")
            s["recent_purchases"] = [dict(r) for r in await cur.fetchall()]

            cur = await db.execute(
                """SELECT u.user_id, u.username, u.first_name,
                          COALESCE(SUM(pr.sales_count),0) AS sold,
                          COALESCE(SUM(pr.sales_count*pr.price_credits),0) AS volume
                   FROM products pr JOIN users u ON u.user_id = pr.creator_id
                   WHERE pr.is_active=1
                   GROUP BY u.user_id ORDER BY volume DESC LIMIT 8""")
            s["top_sellers"] = [dict(r) for r in await cur.fetchall()]
        return s

    # ----- admin: products / moderation -----

    # ----- v4.2.0: استریم زنده (SSE) برای داشبورد real-time -----

    @app.get("/api/admin/stream")
    async def admin_stream(request: Request):
        _guard(request)
        import json as _json

        from fastapi.responses import StreamingResponse

        async def _snapshot() -> dict:
            from database import get_db
            midnight = _local_midnight()
            async with get_db() as db:
                async def one(sql, params=()):
                    cur = await db.execute(sql, params)
                    return (await cur.fetchone())[0]
                snap = {
                    "users_total": await one("SELECT COUNT(*) FROM users"),
                    "users_new": await one("SELECT COUNT(*) FROM users WHERE created_at >= ?", (midnight,)),
                    "users_banned": await one("SELECT COUNT(*) FROM users WHERE is_banned=1"),
                    "sales_total": await one("SELECT COUNT(*) FROM purchases"),
                    "sales_today": await one("SELECT COUNT(*) FROM purchases WHERE purchased_at >= ?", (midnight,)),
                    "volume_today": await one("SELECT COALESCE(SUM(price_credits),0) FROM purchases WHERE purchased_at >= ?", (midnight,)),
                    "credits_circulating": await one("SELECT COALESCE(SUM(credits),0) FROM users WHERE is_banned=0"),
                    "products_active": await one("SELECT COUNT(*) FROM products WHERE is_active=1 AND status='approved'"),
                    "products_pending": await one("SELECT COUNT(*) FROM products WHERE status='pending'"),
                    "deposits_pending": await one("SELECT COUNT(*) FROM deposits WHERE status='pending'"),
                    "withdrawals_pending": await one("SELECT COUNT(*) FROM withdrawals WHERE status='pending'"),
                    "tasks_active": await one("SELECT COUNT(*) FROM tasks WHERE is_active=1"),
                    "tickets_open": await one("SELECT COUNT(*) FROM tickets WHERE status != 'closed'"),
                    "ts": int(time.time()),
                }
            size = 0
            for ext in ("", "-wal", "-shm"):
                p = config.DB_PATH + ext
                if os.path.exists(p):
                    size += os.path.getsize(p)
            snap["db_bytes"] = size
            return snap

        async def gen():
            try:
                for _ in range(400):        # ~۲۰ دقیقه؛ EventSource خودش reconnect می‌شود
                    try:
                        snap = await _snapshot()
                        yield f"data: {_json.dumps(snap, ensure_ascii=False)}\n\n"
                    except Exception:
                        yield ": tick\n\n"
                    await asyncio.sleep(3)
            except asyncio.CancelledError:
                return

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no",
                                          "Connection": "keep-alive"})

    @app.get("/api/admin/products")
    async def admin_products(request: Request, status: str = "", q: str = "",
                             limit: int = 50, offset: int = 0):
        _guard(request)
        from database import escape_like, get_db
        conds, params = ["1=1"], []
        if status in ("pending", "approved", "rejected"):
            conds.append("p.status = ?"); params.append(status)
        if q.strip():
            e = f"%{escape_like(q.strip())}%"
            conds.append("(p.title LIKE ? OR p.tags LIKE ?)"); params += [e, e]
        limit = max(1, min(limit, 100))
        params += [limit, max(0, offset)]
        async with get_db() as db:
            cur = await db.execute(
                f"""SELECT p.*, u.username AS creator_username, u.first_name AS creator_name
                    FROM products p LEFT JOIN users u ON u.user_id = p.creator_id
                    WHERE {' AND '.join(conds)}
                    ORDER BY p.created_at DESC LIMIT ? OFFSET ?""", params)
            return {"items": [_prod_json(dict(r)) for r in await cur.fetchall()]}

    class ModerateIn(BaseModel):
        action: str

    @app.post("/api/admin/products/{pid}/moderate")
    async def admin_moderate(pid: int, body: ModerateIn, request: Request):
        _guard(request)
        from database import set_product_status
        p = await set_product_status(pid, body.action, reviewed_by=0)
        if not p:
            raise HTTPException(409, "قبلاً بررسی شده یا وضعیت نامعتبر")
        await _notify(p["creator_id"], f"📦 محصول «{p['title']}» شما {body.action == 'approved' and 'تأیید و منتشر شد ✅' or 'رد شد ❌'}.")
        return {"ok": True}

    class FlagIn(BaseModel):
        column: str
        value: int

    @app.post("/api/admin/products/{pid}/flag")
    async def admin_flag(pid: int, body: FlagIn, request: Request):
        _guard(request)
        if body.column not in ("is_active", "is_featured"):
            raise HTTPException(400)
        from database import get_db
        async with get_db() as db:
            await db.execute(f"UPDATE products SET {body.column}=? WHERE id=?",
                             (1 if body.value else 0, pid))
        return {"ok": True}

    # ----- admin: deposits / withdrawals -----

    @app.get("/api/admin/deposits")
    async def admin_deposits(request: Request, all_rows: int = 0):
        _guard(request)
        from database import get_db
        where = "" if all_rows else "WHERE d.status='pending'"
        async with get_db() as db:
            cur = await db.execute(
                f"""SELECT d.*, u.username, u.first_name FROM deposits d
                    LEFT JOIN users u ON u.user_id=d.user_id
                    {where} ORDER BY d.created_at DESC LIMIT 100""")
            return {"items": [dict(r) for r in await cur.fetchall()]}

    class ReviewIn(BaseModel):
        action: str

    @app.post("/api/admin/deposits/{did}/review")
    async def admin_dep_review(did: int, body: ReviewIn, request: Request):
        _guard(request)
        if body.action not in ("approved", "rejected"):
            raise HTTPException(400)
        from database import approve_deposit_manual, set_deposit_status, usdt_to_credits
        if body.action == "approved":
            dep = await approve_deposit_manual(did, reviewed_by=0)
        else:
            dep = await set_deposit_status(did, body.action, reviewed_by=0)
        if not dep:
            raise HTTPException(409, "قبلاً بررسی شده")
        credits = usdt_to_credits(dep["amount_usdt"]) if body.action == "approved" else 0
        await _notify(dep["user_id"],
                      f"{'✅' if body.action == 'approved' else '❌'} واریز #{did}: "
                      f"{f'+{credits:,}' if credits else 'تأیید نشد'} کردیت")
        return {"ok": True, "credits": credits}

    @app.get("/api/admin/withdrawals")
    async def admin_withdrawals(request: Request):
        _guard(request)
        from database import get_db
        async with get_db() as db:
            cur = await db.execute(
                """SELECT w.*, u.username, u.first_name FROM withdrawals w
                    LEFT JOIN users u ON u.user_id=w.user_id
                    WHERE w.status='pending' ORDER BY w.created_at DESC LIMIT 100""")
            return {"items": [dict(r) for r in await cur.fetchall()]}

    @app.post("/api/admin/withdrawals/{wid}/review")
    async def admin_wd_review(wid: int, body: ReviewIn, request: Request):
        _guard(request)
        if body.action not in ("paid", "rejected"):
            raise HTTPException(400)
        from database import reject_withdrawal_and_refund, set_withdrawal_status
        if body.action == "rejected":
            wd = await reject_withdrawal_and_refund(wid, reviewed_by=0)
        else:
            wd = await set_withdrawal_status(wid, body.action, reviewed_by=0)
        if not wd:
            raise HTTPException(409, "قبلاً بررسی شده")
        await _notify(wd["user_id"],
                      f"{'💸' if body.action == 'paid' else '↩️'} برداشت #{wid}: "
                      + ("پرداخت شد." if body.action == "paid" else "رد شد و مبلغ به حسابت برگشت."))
        return {"ok": True}

    # ----- admin: users -----

    @app.get("/api/admin/users")
    async def admin_users(request: Request, q: str = "", limit: int = 50,
                          offset: int = 0, filter: str = "", sort: str = ""):
        limit = max(1, min(int(limit), 200))  # F9: بدون سقف → DoS سبک با limit=10^9
        offset = max(0, int(offset))
        _guard(request)
        from database import escape_like, get_db
        cond, extra = "1=1", []
        if q.strip():
            term = q.strip().lstrip("@")
            e = f"%{escape_like(term)}%"
            cond = "(u.username LIKE ? OR u.first_name LIKE ? OR CAST(u.user_id AS TEXT) LIKE ?)"
            extra = [e, e, e]
        # v1.0.1: filters for full user control
        if filter == "banned":
            cond += " AND u.is_banned=1"
        elif filter == "active":
            cond += " AND u.is_banned=0"
        elif filter == "hunters":
            cond += " AND u.role='hunter'"
        elif filter == "sellers":
            cond += (" AND (SELECT COUNT(*) FROM products p "
                     "WHERE p.creator_id=u.user_id AND p.is_active=1)>0")
        elif filter == "buyers":
            cond += (" AND (SELECT COUNT(*) FROM purchases pc "
                     "WHERE pc.buyer_id=u.user_id)>0")
        order = {
            "": "u.created_at DESC",
            "oldest": "u.created_at ASC",
            "credits": "u.credits DESC",
            "earned": "u.total_earned DESC",
            "spent": "u.total_spent DESC",
            "buys": "buys DESC",
        }.get(sort, "u.created_at DESC")
        async with get_db() as db:
            base = f"""SELECT u.*,
                       (SELECT COUNT(*) FROM purchases pc WHERE pc.buyer_id=u.user_id) AS buys,
                       (SELECT COUNT(*) FROM products p WHERE p.creator_id=u.user_id AND p.is_active=1) AS listed
                    FROM users u WHERE {cond}"""
            cnt = await db.execute(f"SELECT COUNT(*) FROM ({base})", extra)
            total = (await cnt.fetchone())[0]
            cur = await db.execute(
                f"{base} ORDER BY {order} LIMIT ? OFFSET ?",
                extra + [limit, offset])
            rows = await cur.fetchall()
            return {"items": [dict(r) for r in rows], "total": total}

    @app.get("/api/admin/users/{uid}/detail")
    async def admin_user_detail(uid: int, request: Request):
        """v1.0.1: full 360° view of a user for the admin panel."""
        _guard(request)
        from database import get_db, get_user
        u = await get_user(uid)
        if not u:
            raise HTTPException(404, "کاربر پیدا نشد")
        u = dict(u) if not isinstance(u, dict) else u
        async with get_db() as db:
            async def _rows(sql, args):
                cur = await db.execute(sql, args)
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in await cur.fetchall()]
            purchases = await _rows(
                """SELECT pc.id, pc.price_credits, pc.purchased_at, pr.title
                   FROM purchases pc LEFT JOIN products pr ON pr.id=pc.product_id
                   WHERE pc.buyer_id=? ORDER BY pc.id DESC LIMIT 15""", (uid,))
            products = await _rows(
                """SELECT id, title, price_credits, sales_count, status, is_active
                   FROM products WHERE creator_id=? ORDER BY id DESC LIMIT 15""", (uid,))
            transactions = await _rows(
                """SELECT * FROM transactions WHERE user_id=?
                   ORDER BY id DESC LIMIT 15""", (uid,))
            refs = await db.execute(
                "SELECT COUNT(*) FROM users WHERE referred_by=?", (uid,))
            referrals = (await refs.fetchone())[0]
        return {"user": u, "purchases": purchases, "products": products,
                "transactions": transactions, "referrals": referrals}

    class RoleIn(BaseModel):
        role: str

    @app.post("/api/admin/users/{uid}/role")
    async def admin_user_role(uid: int, body: RoleIn, request: Request):
        """v1.0.1: change a user's role from the admin panel."""
        _guard(request)
        valid = {"associate", "soldier", "capo", "underboss", "hunter"}
        if body.role not in valid:
            raise HTTPException(400, "نقش نامعتبر")
        from database import get_db, get_user
        u = await get_user(uid)
        if not u:
            raise HTTPException(404, "کاربر پیدا نشد")
        async with get_db() as db:
            await db.execute("UPDATE users SET role=? WHERE user_id=?",
                             (body.role, uid))
            await db.commit()
        role_fa = {"associate": "کارآموز", "soldier": "سرباز", "capo": "کاپو",
                   "underboss": "آندرباس", "hunter": "هانتر"}[body.role]
        await _notify(uid, f"🎭 نقش تو به «{role_fa}» تغییر کرد (ادمین).")
        return {"ok": True}

    class MsgIn(BaseModel):
        text: str

    @app.post("/api/admin/users/{uid}/msg")
    async def admin_user_msg(uid: int, body: MsgIn, request: Request):
        """v1.0.1: send a direct message to a user via the bot."""
        _guard(request)
        text = body.text.strip()[:3000]
        if not text:
            raise HTTPException(400, "متن خالی است")
        if not _BOT:
            raise HTTPException(503, "بات در دسترس نیست")
        try:
            await _BOT.send_message(uid, text)
        except Exception as e:
            raise HTTPException(502, f"ارسال ناموفق: {str(e)[:120]}")
        return {"ok": True}

    class BanIn(BaseModel):
        banned: bool

    @app.post("/api/admin/users/{uid}/ban")
    async def admin_ban(uid: int, body: BanIn, request: Request):
        _guard(request)
        from database import ban_user
        await ban_user(uid, body.banned)
        return {"ok": True}

    class CreditsIn(BaseModel):
        amount: int
        note: str = ""

    @app.post("/api/admin/users/{uid}/credits")
    async def admin_credits(uid: int, body: CreditsIn, request: Request):
        _guard(request)
        if body.amount == 0 or abs(body.amount) > 10_000_000:
            raise HTTPException(400, "مقدار نامعتبر")
        from database import update_credits
        await update_credits(uid, body.amount,
                             "admin_grant" if body.amount > 0 else "admin_deduct",
                             body.note or "Admin web panel")
        await _notify(uid, f"💳 حسابت {body.amount:+,} کردیت شد ({body.note or 'ادمین'}).")
        return {"ok": True}

    # ----- admin: long-term memory -----

    @app.get("/api/admin/memory/{uid}")
    async def admin_memory(uid: int, request: Request):
        _guard(request)
        from memory import _count_memories, get_provider, purchase_profile
        p = await get_provider()
        return {
            "memories": await p.list_all(uid),
            "profile": await purchase_profile(uid),
            "total": await _count_memories(uid),
        }

    class MemAddIn(BaseModel):
        kind: str = "fact"
        content: str

    @app.post("/api/admin/memory/{uid}/add")
    async def admin_memory_add(uid: int, body: MemAddIn, request: Request):
        _guard(request)
        if len(body.content.strip()) < 4:
            raise HTTPException(400, "متن خیلی کوتاه")
        from memory import get_provider
        p = await get_provider()
        ok = await p.add_note(uid, body.kind if body.kind in
                              ("preference", "interest", "skill", "goal", "fact")
                              else "fact", body.content.strip())
        return {"ok": bool(ok), "deduped": not ok}

    class MemDelIn(BaseModel):
        id: int = 0
        all_rows: bool = False

    @app.post("/api/admin/memory/{uid}/delete")
    async def admin_memory_delete(uid: int, body: MemDelIn, request: Request):
        _guard(request)
        from memory import get_provider
        p = await get_provider()
        if body.all_rows:
            n = await p.forget_all(uid)
            return {"ok": True, "deleted": n}
        ok = await p.delete_one(uid, body.id)
        if not ok:
            raise HTTPException(404, "خاطره پیدا نشد")
        return {"ok": True}

    @app.post("/api/admin/memory/{uid}/persona")
    async def admin_memory_persona(uid: int, request: Request):
        _guard(request)
        from memory import persona_refresh, purchase_profile
        await persona_refresh(uid)
        return {"ok": True, "persona": (await purchase_profile(uid))["persona"]}

    # ----- admin: tasks / sessions / settings -----

    @app.get("/api/admin/tasks")
    async def admin_tasks(request: Request):
        _guard(request)
        from database import get_db
        async with get_db() as db:
            cur = await db.execute(
                """SELECT t.*, u.username AS creator_username FROM tasks t
                   LEFT JOIN users u ON u.user_id=t.creator_id
                   ORDER BY t.created_at DESC LIMIT 100""")
            return {"items": [dict(r) for r in await cur.fetchall()]}

    @app.post("/api/admin/tasks/{tid}/toggle")
    async def admin_task_toggle(tid: int, request: Request):
        _guard(request)
        from database import get_db
        async with get_db() as db:
            await db.execute("UPDATE tasks SET is_active = 1 - is_active WHERE id=?", (tid,))
        return {"ok": True}

    @app.get("/api/admin/sessions")
    async def admin_sessions(request: Request):
        _guard(request)
        from database import get_db
        async with get_db() as db:
            cur = await db.execute(
                """SELECT h.user_id, h.session_id, h.updated_at,
                          u.username, u.first_name
                   FROM hermes_sessions h LEFT JOIN users u ON u.user_id=h.user_id
                   ORDER BY h.updated_at DESC LIMIT 100""")
            return {"items": [dict(r) for r in await cur.fetchall()]}

    @app.get("/api/admin/settings")
    async def admin_settings(request: Request):
        _guard(request)
        from database import get_db
        async with get_db() as db:
            cur = await db.execute("SELECT key, value, updated_at FROM settings ORDER BY key")
            return {"items": [dict(r) for r in await cur.fetchall()]}

    class SettingIn(BaseModel):
        key: str
        value: str = ""

    @app.post("/api/admin/settings")
    async def admin_setting_set(body: SettingIn, request: Request):
        _guard(request)
        key = body.key.strip()
        if not key or len(key) > 64:
            raise HTTPException(400)
        from database import set_setting
        await set_setting(key, body.value, updated_by=0)
        return {"ok": True}

    # ----- admin: skills store (Hermes-format SKILL.md manager) -----

    @app.get("/api/admin/skills-store")
    async def admin_skills_list(request: Request):
        _guard(request)
        from skills import list_skills
        return {"items": await list_skills()}

    class SkillAddIn(BaseModel):
        name: str
        content: str

    @app.post("/api/admin/skills-store/add")
    async def admin_skill_add(body: SkillAddIn, request: Request):
        _guard(request)
        from skills import skill_write
        ok, err = await skill_write(body.name, body.content)
        if not ok:
            raise HTTPException(400, err)
        return {"ok": True}

    class SkillToggleIn(BaseModel):
        name: str
        enabled: bool

    @app.post("/api/admin/skills-store/toggle")
    async def admin_skill_toggle(body: SkillToggleIn, request: Request):
        _guard(request)
        from skills import skill_toggle
        if not await skill_toggle(body.name, body.enabled):
            raise HTTPException(404, "مهارت پیدا نشد")
        return {"ok": True}

    class SkillDelIn(BaseModel):
        name: str

    @app.post("/api/admin/skills-store/delete")
    async def admin_skill_delete(body: SkillDelIn, request: Request):
        _guard(request)
        from skills import skill_delete
        if not await skill_delete(body.name):
            raise HTTPException(404, "مهارت پیدا نشد")
        return {"ok": True}

    # ----- admin: hunter role management -----

    @app.get("/api/admin/hunters")
    async def admin_hunters(request: Request):
        _guard(request)
        from database import get_db
        async with get_db() as db:
            cur = await db.execute(
                """SELECT h.*, u.first_name, u.username FROM hunter_permissions h
                   LEFT JOIN users u ON u.user_id = h.user_id
                   ORDER BY h.created_at DESC""")
            cols = [d[0] for d in cur.description]
            return {"items": [dict(zip(cols, r)) for r in await cur.fetchall()]}

    class HunterAddIn(BaseModel):
        user_id: int

    @app.post("/api/admin/hunters/add")
    async def admin_hunter_add(body: HunterAddIn, request: Request):
        _guard(request)
        # Browser admin sessions are signed but do not carry a Telegram user id.
        # Keep the audit value explicit until an admin identity is added to the
        # web login flow; never dereference a placeholder object here.
        from database import get_db, get_user, raw_db
        u = await get_user(body.user_id)
        if not u:
            raise HTTPException(404, "کاربر پیدا نشد")
        # promote to hunter role
        async with get_db() as db:
            await db.execute("UPDATE users SET role='hunter' WHERE user_id=?",
                             (body.user_id,))
            await db.commit()
        # create default permissions row (all off)
        async with raw_db() as db:
            await db.execute(
                "INSERT OR IGNORE INTO hunter_permissions (user_id, granted_by) VALUES (?,?)",
                (body.user_id, 0))
            await db.commit()
        try:
            if _BOT:
                await _BOT.send_message(
                    body.user_id,
                    "🏹 **تو هانتر شدی!**\n\n"
                    "ادمین به تو دسترسی‌های مدیریتی داده.\n"
                    "دسترسی‌هایت را از پنل ادمین چک کن.",
                    parse_mode="Markdown")
        except Exception:
            pass
        return {"ok": True}

    @app.post("/api/admin/hunters/remove")
    async def admin_hunter_remove(body: HunterAddIn, request: Request):
        _guard(request)
        from database import delete_hunter, get_db
        await delete_hunter(body.user_id)
        async with get_db() as db:
            await db.execute("UPDATE users SET role='associate' WHERE user_id=?",
                             (body.user_id,))
            await db.commit()
        return {"ok": True}

    class HunterPermIn(BaseModel):
        user_id: int
        perm: str
        value: bool

    @app.post("/api/admin/hunters/perm")
    async def admin_hunter_perm(body: HunterPermIn, request: Request):
        _guard(request)
        from database import HUNTER_PERMS
        valid_perms = {p[0] for p in HUNTER_PERMS}
        if body.perm not in valid_perms:
            raise HTTPException(400, "دسترسی نامعتبر")
        from database import set_hunter_perm
        await set_hunter_perm(body.user_id, body.perm, body.value, 0)
        return {"ok": True}

    @app.get("/api/admin/hunters/all-users")
    async def admin_all_users_search(request: Request, q: str = ""):
        _guard(request)
        from database import escape_like, get_db
        term = f"%{escape_like(q.strip().lstrip('@'))}%"
        async with get_db() as db:
            cur = await db.execute(
                """SELECT user_id, username, first_name, role FROM users
                   WHERE is_banned=0 AND (username LIKE ? OR CAST(user_id AS TEXT) LIKE ?)
                   LIMIT 10""", (term, term))
            cols = [d[0] for d in cur.description]
            return {"items": [dict(zip(cols, r)) for r in await cur.fetchall()]}

    # ----- admin: backup / restore (portability + safety) -----

    @app.get("/api/admin/backup")
    async def admin_backup_db(request: Request):
        _guard(request)
        from database import snapshot_to
        stamp = time.strftime("%Y%m%d-%H%M%S")
        tmp = os.path.join(tempfile.gettempdir(), f"mp-snap-{stamp}.db")
        await snapshot_to(tmp)
        return FileResponse(
            tmp, filename=f"marketplace-{stamp}.db",
            media_type="application/x-sqlite3",
            background=BackgroundTask(os.remove, tmp),
        )

    @app.get("/api/admin/backup-uploads")
    async def admin_backup_uploads(request: Request):
        _guard(request)

        def _zip_sync() -> str:
            import zipfile
            tmp = os.path.join(tempfile.gettempdir(), f"mp-upl-{time.strftime('%Y%m%d-%H%M%S')}.zip")
            root = os.path.abspath(config.UPLOAD_DIR)
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
                for base, _dirs, files in os.walk(root):
                    for fn in files:
                        full = os.path.join(base, fn)
                        rel = os.path.relpath(full, root)
                        if os.path.commonpath([root, os.path.abspath(full)]) != root:
                            continue
                        z.write(full, arcname=rel)
            return tmp

        tmp = await asyncio.to_thread(_zip_sync)
        return FileResponse(tmp, filename="uploads.zip", media_type="application/zip",
                            background=BackgroundTask(os.remove, tmp))

    async def _save_upload(request: Request, max_mb: int) -> str:
        """Stream the multipart body (single file field 'file') to a temp path."""
        tmp = os.path.join(tempfile.gettempdir(), f"mp-restore-{int(time.time()*1000)}.bin")
        total = 0
        limit = max_mb * 1024 * 1024
        with open(tmp, "wb") as f:
            async for chunk in request.stream():
                total += len(chunk)
                if total > limit:
                    f.close()
                    os.remove(tmp)
                    raise HTTPException(413, "فایل بزرگ‌تر از حد مجاز است")
                f.write(chunk)
        if total == 0:
            os.remove(tmp)
            raise HTTPException(400, "فایلی دریافت نشد")
        return tmp

    @app.post("/api/admin/restore-db")
    async def admin_restore_db(request: Request):
        _guard(request)
        tmp = await _save_upload(request, max_mb=300)
        try:
            def _validate():
                import sqlite3
                con = sqlite3.connect(tmp)
                try:
                    ok = con.execute("PRAGMA integrity_check").fetchone()[0]
                    tables = {r[0] for r in con.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'")}
                    return ok, tables
                finally:
                    con.close()

            ok, tables = await asyncio.to_thread(_validate)
            required = {"users", "products"}
            if ok != "ok" or not required.issubset(tables):
                os.remove(tmp)
                raise HTTPException(400,
                                    "این فایل یک دیتابیس معتبر مارکت‌پلیس نیست "
                                    f"(integrity={ok})")

            pending = os.path.join(os.path.dirname(os.path.abspath(config.DB_PATH)),
                                   "restore-pending.db")
            os.replace(tmp, pending)
            return {
                "ok": True,
                "message": "فایل معتبر بود و صفِ بازیابی شد ✅\n"
                           "الان سرویس را Restart کن — بعد از بالا آمدن، "
                           "دیتابیس جایگزین می‌شود (نسخهٔ قبلی به .pre-restore.bak نگه داشته می‌شود).",
            }
        except HTTPException:
            raise
        except Exception as e:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise HTTPException(400, f"بازیابی ناموفق: {e}")

    @app.post("/api/admin/restore-uploads")
    async def admin_restore_uploads(request: Request):
        _guard(request)
        tmp = await _save_upload(request, max_mb=500)
        try:
            n = 0

            def _extract() -> int:
                import zipfile
                count = 0
                root = os.path.abspath(config.UPLOAD_DIR)
                with zipfile.ZipFile(tmp) as z:
                    for info in z.infolist():
                        name = info.filename.replace("\\", "/")
                        if name.startswith("/") or ".." in name.split("/"):
                            continue  # zip-slip guard
                        dest = os.path.abspath(os.path.join(root, name))
                        if not dest.startswith(root + os.sep) and dest != root:
                            continue
                        os.makedirs(os.path.dirname(dest), exist_ok=True)
                        with z.open(info) as srcf, open(dest, "wb") as out:
                            while True:
                                b = srcf.read(1 << 20)
                                if not b:
                                    break
                                out.write(b)
                        count += 1
                return count

            n = await asyncio.to_thread(_extract)
            return {"ok": True, "restored": n,
                    "message": f"{n} فایل آپلود بازیابی شد ✅"}
        except zipfile.BadZipFile:
            raise HTTPException(400, "این فایل ZIP معتبر نیست")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(400, "خطای سرور — لطفاً بعداً تلاش کنید")
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    # ----- admin: treasury automation -----

    @app.post("/api/admin/treasury/run-once")
    async def admin_treasury_run_once(request: Request):
        _guard(request)
        from treasury_worker import treasury_once
        deposits, withdrawals = await treasury_once()
        return {"ok": True, "deposits_approved": deposits,
                "withdrawals_paid": withdrawals}

    # ----- admin: broadcast -----

    class BroadcastIn(BaseModel):
        text: str

    @app.post("/api/admin/broadcast")
    async def admin_broadcast(body: BroadcastIn, request: Request):
        global _bcast_busy
        _guard(request)
        text = body.text.strip()
        if not text or len(text) > 4000:
            raise HTTPException(400, "متن خالی یا بیش از حد بلند")
        if _BOT is None:
            raise HTTPException(503, "بات در این پروسه اجرا نیست — از داخل bot.py راهش بینداز")
        if _bcast_busy:
            raise HTTPException(429, "برودکست دیگری در جریان است")
        _bcast_busy = True
        try:
            from database import get_db
            async with get_db() as db:
                cur = await db.execute("SELECT user_id FROM users WHERE is_banned=0")
                ids = [r[0] for r in await cur.fetchall()]
            sent = failed = 0
            for uid in ids:
                try:
                    await _BOT.send_message(uid, text, parse_mode=None)
                    sent += 1
                except Exception:
                    failed += 1
                await asyncio.sleep(0.05)
            return {"ok": True, "sent": sent, "failed": failed, "total": len(ids)}
        finally:
            _bcast_busy = False

    # ── v5.0.0 «Ultimate»: War Machine prospects CRM ────────────────────────
    # قیف فروش لیدها: ایمپورت JSON هرمس (دی‌دوپ business+city) → استیج
    # new/warm/won/lost. احراز هویت: کوکی ادمین (hweb) یا هدر `x-crm-token`
    # برابر متغیر محیطی `CRM_TOKEN` (برای اسکریپت/ایمپورت دستی با curl).
    import hmac as _hmac

    from prospects import (
        crm_stats as _crm_stats,
        import_leads as _crm_import,
        list_prospects as _crm_list,
        set_stage as _crm_set_stage,
    )

    def _crm_authed(request: Request) -> bool:
        want = os.getenv("CRM_TOKEN", "").strip()
        got = request.headers.get("x-crm-token", "")
        if want and got and _hmac.compare_digest(got, want):
            return True
        return _is_admin(request)

    def _crm_guard(request: Request) -> None:
        if _crm_authed(request):
            if request.method == "POST" and request.headers.get("x-crm-token", ""):
                return  # توکن برنامه‌ای — CSRF ندارد
            if request.method == "POST":
                if request.headers.get("x-requested-with") != "fetch":
                    raise HTTPException(403, "bad origin")
            return
        raise HTTPException(401, "unauthorized")

    @app.get("/crm")
    async def page_crm(request: Request):
        if not _is_admin(request):
            return RedirectResponse("/login", 302)
        return FileResponse(os.path.join(WEB_DIR, "prospects.html"))

    @app.get("/api/prospects")
    async def api_prospects(request: Request, stage: str = "",
                            q: str = "", limit: int = 200):
        _crm_guard(request)
        return {"stats": await _crm_stats(),
                "items": await _crm_list(stage, q, limit),
                "stages": ["new", "warm", "won", "lost"]}

    @app.post("/api/hermes/import")
    async def api_hermes_import(request: Request):
        """قرارداد ایمپورت هرمس: آرایه خام یا {"items": [...]}"""
        _crm_guard(request)
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(400, "body is not valid JSON")
        items = payload.get("items") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            raise HTTPException(400, 'expected [...] or {"items": [...]}')
        res = await _crm_import(items)
        return {"ok": True, **res}

    class ProspectStageIn(BaseModel):
        stage: str

    @app.post("/api/prospects/{pid}/stage")
    async def api_prospect_stage(pid: int, body: ProspectStageIn,
                                 request: Request):
        _crm_guard(request)
        if not await _crm_set_stage(pid, body.stage):
            raise HTTPException(404, "prospect not found or bad stage")
        return {"ok": True, "id": pid, "stage": body.stage}

    # ── v0.5.1: سرو فایل‌های استاتیک وب (sw.js / manifest / icon / fonts / vendor / assets)
    # Mount در ریشه ولی «آخر از همه» → فقط مسیرهایی که route ندارند را سرو می‌کند.
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=WEB_DIR, html=False), name="web-static")

    @app.on_event("startup")
    async def _ensure_db_ready():
        """وب استقلال‌پذیر: اگر DB خالی بود (وب-تنها/تست)، خودش بسازد — idempotent."""
        try:
            from database import init_db
            await init_db()
        except Exception as e:
            print(f"[web_admin] init_db warning: {e}", flush=True)

    return app


async def _notify(user_id: int, text: str):
    """Best-effort Telegram notification (no-op when bot offline)."""
    if _BOT is None:
        return
    try:
        await _BOT.send_message(user_id, text, parse_mode=None)
    except Exception:
        pass


async def start_server(bot=None):
    global _BOT
    _BOT = bot
    # Railway injects PORT; otherwise fall back to WEB_PORT / 8080.
    port = int(os.getenv("PORT") or os.getenv("WEB_PORT", "8080") or 8080)
    host = os.getenv("WEB_HOST", "0.0.0.0")
    try:
        import uvicorn
    except ImportError:
        logger.warning("uvicorn نصب نیست — داشبورد وب غیرفعال.")
        return
    from database import init_db
    await init_db()
    app = build_app()
    logger.info("Web dashboard on http://%s:%s  (admin: /admin)", host, port)
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    await server.serve()


if __name__ == "__main__":
    asyncio.run(start_server(None))
