#!/usr/bin/env python3
"""v2.1.0 «روز اول» — ابزار دموی زنده پروسپکت

یک کسب‌وکار هدف را در ۳۰ ثانیه به یک فروشگاه تلگرامی زنده و برندشده تبدیل می‌کند:

    python tools_seed_prospect.py --name "Pasta Fresca" --kind restaurant --city London

سپس با BRAND_NAME=... بات/وب را بوت کن — لندینگ و خوش‌آمد بات با برندِ
پروسپکت بالا می‌آید (whitelabel از config.py). برای پاک‌سازی: --wipe

این ابزار فقط با دیتابیس کار می‌کند — به BOT_TOKEN نیازی ندارد.
"""
import argparse
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import config  # noqa: E402

# id محصولات دمو از ۹۰۱ شروع می‌شود تا با seed لانچ (۱-۴) تداخل نکند
SEED_ID_START = 901
SEED_ID_END = 949
SETTING_KEY = "demo_prospect"

# قیمت‌ها کردیت دمویی‌اند (۱۰۰۰ = ۱$) و فقط برای نمایش است
PRESETS: dict[str, list[tuple[str, str, int]]] = {
    "restaurant": [
        ("Signature Grill Platter", "Char-grilled house special with seasonal sides", 2400),
        ("Fresh Pasta Bowl", "Hand-rolled pasta, slow-cooked sauce of the day", 1800),
        ("Mezze Starter Board", "Chef's selection of dips, breads and pickles", 1200),
        ("Dessert of the Day", "Ask the counter — changes every morning", 900),
        ("House Lemonade", "Freshly squeezed, lightly sparkling", 600),
        ("Family Feast Box", "Everything the table needs — feeds 4", 5600),
    ],
    "cafe": [
        ("Flat White", "Double shot, silky micro-foam", 450),
        ("Cold Brew 16oz", "18-hour steep, single origin", 500),
        ("Butter Croissant", "Baked in-house every morning", 400),
        ("Cheesecake Slice", "New-York style, seasonal topping", 700),
        ("Avocado Toast", "Sourdough, poached egg, chili flakes", 900),
        ("Coffee Beans 250g", "House roast, whole bean", 1500),
    ],
    "gym": [
        ("Day Pass", "Full access — weights, cardio, sauna", 800),
        ("Monthly Membership", "Unlimited visits + 1 free PT session", 4500),
        ("Personal Training 1:1", "60-minute coached session", 2200),
        ("Protein Starter Pack", "Shaker + 5 sample sachets", 1000),
        ("Class Bundle x10", "Any 10 group classes", 3000),
        ("Body Scan + Plan", "InBody scan with a 4-week plan", 1600),
    ],
    "salon": [
        ("Classic Haircut", "Consultation + wash + style", 1200),
        ("Full Color Session", "Premium dyes, includes treatment", 3500),
        ("Manicure + Gel", "Shape, cuticle care, long-lasting gel", 1400),
        ("Beard Trim & Care", "Hot towel finish", 700),
        ("Bridal Package", "Full trial + day-of styling", 6500),
        ("Skincare Facial", "Deep-cleanse with premium products", 1800),
    ],
}


async def seed(name: str, kind: str, city: str) -> None:
    import database as db
    await db.init_db()

    admin = config.ADMIN_IDS[0] if config.ADMIN_IDS else 10
    # products.creator_id → users.id (FK) — سازنده باید وجود داشته باشد
    # (همان الگوی tools_seed_demo.py که اول کاربران دمو را می‌سازد)
    try:
        await db.create_user(user_id=admin, username="demo_operator", first_name="Operator")
    except Exception:
        pass  # از قبل هست

    items = PRESETS.get(kind)
    if not items:
        print(f"❌ preset ناشناخته: {kind} — گزینه‌ها: {', '.join(PRESETS)}")
        return

    ids: list[int] = []
    now = time.time()
    async with db.raw_db() as con:
        pid = SEED_ID_START
        for title, desc, price in items:
            await con.execute(
                "INSERT OR IGNORE INTO products (id, creator_id, title, description, "
                "price_credits, status, views, impressions, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (pid, admin, title, desc, price, "approved",
                 (pid * 7) % 90 + 40, (pid * 13) % 240 + 80, now),
            )
            ids.append(pid)
            pid += 1
        await con.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
            (SETTING_KEY, json.dumps(
                {"name": name, "kind": kind, "city": city,
                 "product_ids": ids, "seeded_at": now}, ensure_ascii=False)),
        )
        await con.commit()

    cur = await db.get_setting("demo_prospect", "")
    if not cur:
        print("⚠️ ثبت تنظیمات دمو ناموفق بود — ولی محصولات seed شدند")

    print()
    print("=" * 60)
    print(f"✅ دموی «{name}» ({kind}) با {len(items)} آیتم منو آماده شد")
    print("=" * 60)
    print()
    print("۱) برند را ست کن (همان لحظه، قبل از بوت):")
    print(f'   export BRAND_NAME="{name}"')
    print(f'   export BRAND_TAGLINE="Order from {name} — live demo"')
    print(f'   export BRAND_FOOTER="© ۲۰۲۶ {name} — demo build"')
    print()
    print("۲) بوت (لینک دمو: لندینگ + فروشگاه + بات):")
    print("   python run.py          # یا فقط وب:  WEB_PORT=8000 python run.py")
    print()
    print("۳) پیچ ۳۰ ثانیه‌ای (کیت کامل: DAY1-SALES-KIT.md):")
    print(f'   «{name} — این فروشگاهِ تلگرامیِ خودتونه، همین الان زنده‌ست.')
    print('    ظرف ۴۸ ساعت سفارشی‌شش می‌کنم: منوی واقعی، رنگ برند، آیکن خودتون.')
    print('    £۱۵۰ یک‌جا، پرداخت فقط بعد از اینکه دمو رو پسندیدین.»')
    print()
    print("🧹 پاک‌سازی: python tools_seed_prospect.py --wipe")

    # bot.py در خاموشی همین کار را می‌کند — بدون آن aiosqlite worker
    # در threading._shutdown هنگ می‌کند و پروسه خارج نمی‌شود
    from database import close_pool
    await close_pool()


async def wipe() -> None:
    import database as db
    await db.init_db()
    raw = await db.get_setting(SETTING_KEY, "")
    ids: list[int] = []
    if raw:
        try:
            ids = list(json.loads(raw).get("product_ids", []))
        except Exception:
            ids = []
    async with db.raw_db() as con:
        if ids:
            marks = ",".join("?" for _ in ids)
            await con.execute(f"DELETE FROM products WHERE id IN ({marks})", ids)
        else:
            await con.execute(
                "DELETE FROM products WHERE id >= ? AND id <= ?",
                (SEED_ID_START, SEED_ID_END),
            )
        await con.execute("DELETE FROM settings WHERE key = ?", (SETTING_KEY,))
        await con.commit()
    print(f"🧹 داده‌های دموی پروسپکت پاک شد ({len(ids or [])} محصول)")
    from database import close_pool
    await close_pool()


def main() -> None:
    ap = argparse.ArgumentParser(description="DropAgentX prospect demo seeder (v2.1.0)")
    ap.add_argument("--name", default="", help="prospect business name")
    ap.add_argument("--kind", default="restaurant", choices=sorted(PRESETS),
                    help="business preset")
    ap.add_argument("--city", default="", help="city (informational)")
    ap.add_argument("--wipe", action="store_true", help="remove seeded demo data")
    args = ap.parse_args()

    if args.wipe:
        asyncio.run(wipe())
        return
    if not args.name.strip():
        ap.error("--name لازم است (مثال: --name \"Pasta Fresca\")")
    asyncio.run(seed(args.name.strip(), args.kind, args.city.strip()))


if __name__ == "__main__":
    main()
