# 🚂 استقرار از GitHub به Railway (راهنمای گام‌به‌گام)

> خروجی نهایی: یک سرویس Railway که با هر `git push` خودکار دپلوی می‌شود —
> بات تلگرام + وب‌اپ + پنل ادمین روی یک سرویس واحد.

## ۰) پیش‌نیازها

- اکانت [GitHub](https://github.com) و اکانت [Railway](https://railway.com)
- توکن ربات تلگرام از [@BotFather](https://t.me/BotFather)
- آیدی عددی ادمین از [@userinfobot](https://t.me/userinfobot)

## ۱) آپلود روی GitHub

```bash
# از داخل پوشهٔ پروژه (KIAdropAgentX)
git init
git add .
git commit -m "DropAgentX Ultimate v5.0.0"
git branch -M main
git remote add origin https://github.com/KiaAgentX/DropAgentX.git
git push -u origin main
```

> ریپو را **Private** بزنید؛ `railway-variables*.env` و `.env` هرگز کامیت نمی‌شوند
> (در `.gitignore` قفل است).

## ۲) اتصال Railway

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**
2. ریپوی `DropAgentX` را انتخاب کنید → Railway خودش `Dockerfile` را پیدا می‌کند
   (build از `railway.json` هم خوانده می‌شود؛ دستی تغییرش ندهید)
3. منوی سرویس → **Settings**:
   - **Healthcheck Path:** `/healthz` (در `railway.json` ثبت است)
   - **Volume** اضافه کنید و متغیر `DATA_DIR` را ریشهٔ آن بگذارید (مثلا `/data`)
     تا دیتابیس/آپلود بین دپلوی‌ها پایدار بماند

## ۳) متغیرهای محیطی (Settings → Variables → Raw)

حداقلِ لازم:

| کلید | مقدار |
|---|---|
| `BOT_TOKEN` | توکن BotFather |
| `ADMIN_IDS` | آیدی عددی شما (کاما برای چند نفر) |
| `WEB_PASSWORD` | رمز ورود پنل `/admin` |
| `WEB_SECRET` | ۳۲+ کاراکتر رندوم (مثلا `openssl rand -hex 24`) |
| `COOKIE_SECURE` | `1` |
| `CRM_TOKEN` | رندوم — برای ایمپورت لید با curl (اختیاری) |

کلیدهای تکمیلی (AI، وایت‌لیبل `BRAND_*`، کیف USDT و…) را از `.env.example` کپی کنید.
فهرست کامل: `config.py`.

## ۴) دپلوی

- Save → Railway خودکار build می‌زند (تصویر Docker از `mirror.gcr.io`)
- سالم بودن: `GET https://<dom>.up.railway.app/healthz` → `{"ok": true, "version": "5.0.0"}`
- ورود ادمین: `https://<dom>.up.railway.app/login` با `WEB_PASSWORD`
- CRM: `https://<dom>.up.railway.app/crm`

## ۵) دپلوی خودکار با Push

از همان لحظهٔ اتصال، هر `git push` به `main` یک دپلوی جدید می‌زند.

```bash
git add . && git commit -m "feat: ..." && git push
```

گیت‌هاب CI (`.github/workflows/ci.yml`) قبل از هر push اجرا می‌شود:
تست‌ها + بررسی syntax + اسکن سکرت.

## ۶) نکات مهم

- **هر مشتری/دمو = یک سرویس جدا** با `BRAND_NAME` خودش (DAY1-SALES-KIT.md)
- اگر مأموریت هرمس روی همان اکانت Railway است، سرویس جدا بساز تا سهمیه تریال
  برای مأموریت اصلی بماند
- لاگ‌ها: سرویس → Logs (لاگ JSON ساختاریافته است)
- بازگشت امن: Railway در تب **Deployments** روی هر نسخه دکمه **Redeploy** دارد

## ۷) عیب‌یابی سریع

| علامت | دلیل رایج | راه‌حل |
|---|---|---|
| بات بالا نمی‌آید | `BOT_TOKEN` خالی/خراب | Variable را چک کن + Restart |
| لاگین ادمین رد می‌شود | `WEB_SECRET` خالی یا تغییرکرده | یک‌بار ثبتش کن، کوکی‌ها ری‌ست شوند |
| `401` در `/api/hermes/import` | کوکی/توکن ندارد | هدر `x-crm-token` با مقدار `CRM_TOKEN` |
| دیتابیس بعد از دپلوی خالی است | Volume و `DATA_DIR` ست نیست | بخش ۲-۳ را کامل کن |
| خطای build | تغییر در `Dockerfile`/`requirements.txt` | CI محلی: `pytest` را بگیر |
