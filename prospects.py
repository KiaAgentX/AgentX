#!/usr/bin/env python3
"""v5.0.0 «Ultimate» — War Machine prospects CRM (lead pipeline).

ایمپورت لیدهای Hermes (JSON) → دی‌دوپ خودکار کلید `business + city` →
استیج‌های فروش `new / warm / won / lost` — همان قراردادی که در
`docs/sales/WAR-MACHINE.md` مستند شده است.

این ماژول عمداً «سبک» نگه داشته شده:
- import آن هیچ وابستگی سنگینی (aiogram / fastapi) ندارد؛
- اتصال دیتابیس فقط داخل توابع async باز می‌شود،
  پس `tools_validate_leads.py` می‌تواند بدون BOT_TOKEN و بدون DB از
  `normalize_item()` استفاده کند.
"""
from __future__ import annotations

from typing import Any

# استیج‌های قیف فروش (ترتیب = چرخه عمر)
STAGES: tuple[str, ...] = ("new", "warm", "won", "lost")

# کلیدهای جایگزین پذیرفته‌شده در JSON ایمپورت (همه lower-case مقایسه می‌شوند)
_ALIASES: dict[str, tuple[str, ...]] = {
    "business": ("business", "name", "title"),
    "category": ("category", "type", "cuisine"),
    "city": ("city", "area", "neighborhood"),
    "rating": ("rating", "stars", "star"),
    "reviews": ("reviews", "review_count", "reviewcount"),
    "instagram": ("instagram", "ig", "handle"),
    "website": ("website", "site"),
    "source_url": ("sourceurl", "source_url", "url", "link"),
    "address": ("address",),
    "phone": ("phone", "tel", "telephone"),
    "notes": ("notes", "note"),
}

_MAX = {
    "business": 300, "category": 160, "city": 160, "instagram": 120,
    "source_url": 2000, "address": 400, "phone": 64, "notes": 1000,
}

_FIELDS = (
    "business", "category", "city", "rating", "reviews",
    "instagram", "website", "source_url", "address", "phone", "notes",
)


def _norm_key(k: Any) -> str:
    return str(k).strip().lower().replace(" ", "").replace("-", "_")


def _pick(item: dict, field: str) -> Any:
    """مقدار فیلد را با نگاه به همهٔ aliasهای آن پیدا می‌کند."""
    lowered = {_norm_key(k): v for k, v in item.items()}
    for key in _ALIASES[field]:
        if key in lowered:
            return lowered[key]
    return None


def _text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    if s.lower() in ("none", "null", "nil", "nan"):
        return ""
    return s[:limit]


def _rating(value: Any) -> float | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        r = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        raise ValueError("rating must be a number between 0 and 5")
    if r < 0 or r > 5:
        raise ValueError("rating must be between 0 and 5")
    return round(r, 2)


def _reviews(value: Any) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        n = int(float(str(value).replace(",", "").strip()))
    except (TypeError, ValueError):
        raise ValueError("reviews must be an integer")
    if n < 0:
        raise ValueError("reviews must be >= 0")
    return n


def normalize_item(item: Any) -> tuple[dict | None, str]:
    """یک رکورد خام را به ردیف استاندارد CRM تبدیل می‌کند.

    خروجی: (row, "") در صورت سلامت · (None, دلیل خطا) در صورت رد شدن.
    """
    if not isinstance(item, dict):
        return None, "not an object"
    try:
        business = _text(_pick(item, "business"), _MAX["business"])
        city = _text(_pick(item, "city"), _MAX["city"])
        if not business:
            return None, "missing business/name"
        if not city:
            return None, "missing city/area"
        website_raw = _pick(item, "website")
        website = _text(website_raw, 2000) or None  # null = لید بدون سایت
        row = {
            "business": business,
            "category": _text(_pick(item, "category"), _MAX["category"]),
            "city": city,
            "rating": _rating(_pick(item, "rating")),
            "reviews": _reviews(_pick(item, "reviews")),
            "instagram": _text(_pick(item, "instagram"), _MAX["instagram"]),
            "website": website,
            "source_url": _text(_pick(item, "source_url"), _MAX["source_url"]),
            "address": _text(_pick(item, "address"), _MAX["address"]),
            "phone": _text(_pick(item, "phone"), _MAX["phone"]),
            "notes": _text(_pick(item, "notes"), _MAX["notes"]),
        }
        return row, ""
    except ValueError as e:
        return None, str(e)


# --------------------------------------------------------------------------
# data layer (اتصال DB فقط داخل توابع async)
# --------------------------------------------------------------------------

async def _ensure() -> None:
    from database import get_db
    async with get_db() as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS prospects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business TEXT NOT NULL,
                category TEXT DEFAULT '',
                city TEXT NOT NULL,
                rating REAL,
                reviews INTEGER,
                instagram TEXT DEFAULT '',
                website TEXT,
                source_url TEXT DEFAULT '',
                address TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                stage TEXT DEFAULT 'new',
                created_at REAL DEFAULT (strftime('%s','now')),
                updated_at REAL DEFAULT (strftime('%s','now')),
                UNIQUE(business, city)
            )""")
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage)")


async def import_leads(items: list, stage: str = "new") -> dict:
    """ایمپورت دسته‌ای با دی‌دوپ خودکار روی (business, city).

    خروجی: {"created": N, "duplicates": M, "skipped": K, "errors": [...]}
    """
    await _ensure()
    if stage not in STAGES:
        stage = "new"
    created = duplicates = skipped = 0
    errors: list[str] = []
    if not isinstance(items, list):
        return {"created": 0, "duplicates": 0, "skipped": 1,
                "errors": ["payload must be a JSON array"]}

    from database import get_db
    async with get_db() as db:
        for idx, raw in enumerate(items):
            row, err = normalize_item(raw)
            if row is None:
                skipped += 1
                if len(errors) < 20:
                    errors.append(f"item[{idx}]: {err}")
                continue
            cur = await db.execute(
                """INSERT OR IGNORE INTO prospects
                   (business, category, city, rating, reviews, instagram,
                    website, source_url, address, phone, notes, stage)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (row["business"], row["category"], row["city"], row["rating"],
                 row["reviews"], row["instagram"], row["website"],
                 row["source_url"], row["address"], row["phone"],
                 row["notes"], stage))
            if cur.rowcount:
                created += 1
            else:
                duplicates += 1
    return {"created": created, "duplicates": duplicates,
            "skipped": skipped, "errors": errors}


async def list_prospects(stage: str = "", q: str = "",
                         limit: int = 200) -> list[dict]:
    await _ensure()
    limit = max(1, min(int(limit or 200), 1000))
    sql = ["SELECT * FROM prospects"]
    where: list[str] = []
    params: list[Any] = []
    if stage in STAGES:
        where.append("stage = ?")
        params.append(stage)
    if q:
        where.append("(business LIKE ? OR city LIKE ? OR category LIKE ? "
                     "OR instagram LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like, like])
    if where:
        sql.append("WHERE " + " AND ".join(where))
    sql.append("ORDER BY created_at DESC LIMIT ?")
    params.append(limit)
    from database import get_db
    async with get_db() as db:
        cur = await db.execute(" ".join(sql), tuple(params))
        return [dict(r) for r in await cur.fetchall()]


async def set_stage(pid: int, stage: str) -> bool:
    if stage not in STAGES:
        return False
    await _ensure()
    from database import get_db
    async with get_db() as db:
        cur = await db.execute(
            "UPDATE prospects SET stage = ?, updated_at = strftime('%s','now') "
            "WHERE id = ?", (stage, int(pid)))
        return cur.rowcount > 0


async def crm_stats() -> dict:
    await _ensure()
    from database import get_db
    async with get_db() as db:
        cur = await db.execute(
            "SELECT stage, COUNT(*) FROM prospects GROUP BY stage")
        rows = dict(await cur.fetchall())
    total = sum(rows.values())
    return {"total": total,
            **{s: rows.get(s, 0) for s in STAGES}}
