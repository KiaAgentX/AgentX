# ⛏️ Hermes Miner — بسته مأموریت معدن لید

> هرمس روی Railway زنده است (۵۳ مهارت، مرورگر واقعی، کرون، حافظه دائمی).
> پیام‌های زیر را در تلگرامِ هرمس بفرست، خروجی JSON را از مسیرهای بخش ۲
> وارد CRM کن (دکمه 🤝 در پنل ادمین یا `/crm` در ربات).

## 📨 مأموریت جاری — معدن لندن (پیام آماده، انگلیسی)

```
Mission update — London mining, refined:

1) Crown job: 10 independent London restaurants.
   - Google Maps rating 4.0–5.0, 50–1000 reviews, no website (website=null).
   - Skip chains. Capture: business, category, city, rating, reviews,
     instagram, address, phone, sourceUrl.

2) Deliver as ONE JSON document (Telegram file), exactly this shape:
[{"business":"...","category":"...","city":"London","rating":4.6,
  "reviews":187,"instagram":"@handle","website":null,
  "sourceUrl":"https://...maps...","address":"...","phone":"..."}]

3) Housekeeping: cron guard every 6h (not hourly), df/du numbers IN the report,
   deliver files as Telegram documents after local cleanup (volume is 500MB).

4) Skill note: save this pattern to local-business-prospecting so the next
   missions (cafes, gaming cafés, gyms, salons) are cheaper and faster.
```

## 📬 تحویل خروجی — سه مسیر (همه با دی‌دوپ خودکار)

1. **وب‌CRM:** پنل ادمین → 🤝 CRM لیدها → پیست JSON → ایمپورت
2. **خط فرمان:** `python tools_validate_leads.py leads.json` → در صورت سبز بودن، پیست در `/crm`
3. **API:** `curl -X POST $BASE/api/hermes/import -H "x-crm-token: $CRM_TOKEN" -H "Content-Type: application/json" --data @leads.json`

گزارش سالم: `{"ok":true,"created":N,"duplicates":M,"skipped":K}` — تکراری = همان `business+city`.

## 📜 ۶ قانون کاری هرمس (قفل شده)

1. فقط پیش‌نویس/تحقیق — ارسال نهایی انسانی
2. بدون جعل ریویو یا داده
3. رک و مختصر در پاسخ‌ها
4. خروجی JSON ساخت‌یافته (قرارداد WAR-MACHINE.md)
5. بهداشت دیسک: تحویل فایل به‌صورت داکیومنت تلگرام، پاک‌سازی محلی بعد از هر مأموریت، ممیزی `df`/`du` با عدد
6. هیچ کریپتویی — شکاف والت/DID رد می‌شود

## 🗓 صف مأموریت‌های بعدی (هم‌راستا با پریست‌های دمو)

| اولویت | مأموریت | پریست دمو هم‌زمان |
|---|---|---|
| 1 | ۱۰ رستوران لندن (جاری) | `restaurant` |
| 2 | ۱۰ کافه مستقل | `cafe` |
| 3 | ۸ گیم‌کافه / فضای بازی | `gym` (یا restaurant) |
| 4 | ۸ ژیم/استودیوی بوتیک | `gym` |
| 5 | ۸ سالن زیبایی/باربر | `salon` |

## 🔧 نگهداری Railway

- ولوم ۵۰۰MB — `HOME=/data`؛ کرون نگهبان ۶ ساعته: پاک‌سازی لاگ/کش + گزارش اعداد
- هر مأموریت = سشن جدید = توکن/لاگ → مأموریت‌های پک‌شده ارزان‌ترند
