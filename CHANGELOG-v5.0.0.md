# DropAgentX — Changelog v5.0.0 «Ultimate»

> **نسخهٔ Ultimate — KIAdropAgentX.** این نسخه نقطهٔ اجتماع دو خط شماره‌گذاری
> قبلی (legacy `v4.2.0` «فول‌وب» + خط جدید `2.1.0` «روز اول») است و کل زنجیرهٔ
> درآمدی کمپین KIA را داخل خودِ پروژه می‌آورد.

## ➕ قابلیت‌های جدید (هسته)

### 🤝 CRM لیدها — «War Machine» داخل پروژه
- ماژول جدید `prospects.py`: ایمپورت JSON هرمس با **دی‌دوپ خودکار `business+city`**،
  اعتبارسنج (ریتینگ ۰–۵، ریویو عددی، کلیدهای جایگزین `name/area/stars/ig/url`)
  و قیف فروش ۴ استیجی `new → warm → won → lost`
- API جدید در وب‌اپ:
  - `POST /api/hermes/import` (آرایه خام یا `{"items":[...]}` — قرارداد War Machine)
  - `GET /api/prospects?stage=&q=` (آمار + لیست)
  - `POST /api/prospects/{id}/stage` (جابه‌جایی استیج)
  - احراز هویت دوگانه: کوکی ادمین یا هدر `x-crm-token` برابر `CRM_TOKEN`
- صفحهٔ وب جدید **`/crm`** (`web/prospects.html`): کارت‌های آمار، پنل پیست JSON،
  جدول با جستجو/فیلتر، تغییر استیج یک‌کلیکی — RTL و موبایل‌پسند
- دستور ربات **`/crm`**: آمار قیف + ۸ لید آخر + دکمه‌های تغییر استیج (فقط ادمین)
- دکمهٔ «🤝 CRM لیدها» در نوی پنل ادمین

### 🛠 ابزارها
- `tools_validate_leads.py`: اعتبارسنج خط فرمان JSON لیدها (بدون BOT_TOKEN و
  بدون DB) — `--out` فایل پاک‌شده، `--json` خروجی ماشین‌خوان، exit code استاندارد
- `.env.example` کامل (کلیدهای اصلی در ۱۰ بخش + راه‌اندازی محلی/Railway)

### 🧰 زیرساخت GitHub + Railway
- `.github/workflows/ci.yml`: compileall + ruff + اسکن سکرت + pytest روی هر push/PR
- راهنمای کامل `docs/DEPLOY-GITHUB-RAILWAY.md` (GitHub → Railway با Volume و healthz)

## 📚 دانش‌محصولات ادغام‌شده از فورک‌های KIA (بدون تغییر معماری)

| سند | منبع | محتوا |
|---|---|---|
| `docs/sales/WAR-MACHINE.md` | fork-1 | قالب پیام سه‌کاناله، چک‌لیست کیفیت، اسکریپت £150، قرارداد JSON |
| `docs/sales/ZENOVIX-UPSELL.md` | fork-3 | کیت آپ‌سِل £29/ماه پذیرش هوشمند (HITL) |
| `docs/missions/HERMES-MINER.md` | fork-4 | پیام مأموریت معدن لندن، ۶ قانون، صف مأموریت‌ها |
| `docs/DESKTOP.md` | جدید | وب/موبایل/دسکتاپ: PWA، نصب دسکتاپ، TWA |

## 🔧 سازگاری

- صفر شکستن معماری: همان `bot.py → handlers → database` (aiogram + aiosqlite) و
  همان `web_admin.build_app()` (FastAPI) — فقط route و handler اضافه شده
- اسکیمای دیتابیس: یک جدول جدید `prospects` (idempotent با `CREATE TABLE IF NOT EXISTS`)
  — جداول موجود دست‌نخورده
- اقتصاد کردیت/کیف USDT، A2A/MCP، هرمس‌انجین، وایت‌لیبل `BRAND_*`: بدون تغییر
- `VERSION = "5.0.0"` — سازگار با تست قرارداد `/healthz`

## 🧪 تست

- `tests/test_v500.py` (جدید): نرمال‌ساز aliasها، دی‌دوپ ایمپورت، استیج‌ها،
  مسیرهای API با کوکی ادمین و `CRM_TOKEN`، اعتبارسنج CLI
