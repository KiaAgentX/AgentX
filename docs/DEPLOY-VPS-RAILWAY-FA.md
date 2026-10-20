# 🚀 استقرار دووجهانه — یک کد، دو مقصد (0.5.1)

همان ریپو، همان `python run.py` — فقط مقصد فرق می‌کند.

## ▶️ راه‌انداز واحد (`run.py`)
```
Railway : PORT تزریق می‌شود → خودکار به WEB_PORT نگاشت می‌شود → بات + وب در یک سرویس
VPS     : WEB_PORT را در systemd/nginx ست می‌کنی → همان رفتار
فقط بات : نه PORT نه WEB_PORT → وب بالا نمی‌آید
DATA_DIR: اگر ست شود → DB/UPLOAD/BACKUP همه زیر آن (Volume مناسب)
```

## 🚂 Railway (سریع‌ترین راه)
1. ریپو → New Project → Deploy from repo (Dockerfile خودکار)
2. یک **Volume** به `/app/data` وصل کن
3. متغیرها:
| متغیر | الزامی | توضیح |
|---|---|---|
| `BOT_TOKEN` | ✅ | از @BotFather |
| `ADMIN_IDS` | ✅ | آیدی عددی ادمین‌ها |
| `FILE_STORAGE_CHANNEL_ID` | توصیه | کانال ذخیره فایل (ظرفیت ابری) |
| `SUPPORT_CONTACT` | اختیاری | پیش‌فرض @ImXforevr |
| `BOT_USERNAME` | توصیه | یوزرنیم بات برای دکمه‌های صفحات وب |
| `COOKIE_SECURE` | توصیه | روی HTTPS =1 (دومین Railway) — روی http خالی نذار |
4. healthcheck: `/healthz` (در railway.json تنظیم است) — پاسخ: `{"version":"0.5.1"}`
5. بات را ادمین کانال ذخیره فایل کن. تمام!

> نکته: Railway وب را روی `PORT` سرو می‌کند → domain خود Railway یا دامنهٔ شخصی (Settings → Networking).

## 🖥 VPS (Ubuntu + systemd + nginx)
```bash
# ۱) کد و محیط
git clone <repo> /opt/dropagentx && cd /opt/dropagentx
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # BOT_TOKEN, ADMIN_IDS, WEB_PORT=8080, DATA_DIR=/opt/dropagentx/data
                       # پشت nginx/TLS حتماً: COOKIE_SECURE=1

# ۲) سرویس یکپارچه (بات + وب با هم)
cat >/etc/systemd/system/dax.service <<UNIT
[Unit]
Description=DropAgentX (bot+web)
After=network-online.target
[Service]
WorkingDirectory=/opt/dropagentx
EnvironmentFile=/opt/dropagentx/.env
ExecStart=/opt/dropagentx/.venv/bin/python run.py
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl enable --now dax
```
```nginx
# ۳) nginx (TLS با certbot)
server {
  server_name your.domain.tld;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  # SSE داشبورد زنده — بدون بافر!
  location /api/admin/stream {
    proxy_pass http://127.0.0.1:8080;
    proxy_buffering off;
    proxy_read_timeout 3600;
  }
}
```
```bash
# ۴) نگهداری
systemctl status dax
python tools_db_doctor.py            # سلامت DB
python tools_backup.py /backup/dir   # بک‌اپ DB + CSV
```

## 🔀 انتخاب مقصد — کدام برای من؟
| | Railway | VPS |
|---|---|---|
| راه‌اندازی | ۵ دقیقه | ~۳۰ دقیقه |
| هزینه شروع | پلن مصرفی | از ~۵$/ماه |
| ظرفیت DB | Volume تا سقف پلن | دیسک کامل سرور |
| کنترل | کم | کامل (systemd/nginx/مونیتورینگ) |
| مهاجرت | — | بک‌اپ `marketplace.db` را در `DATA_DIR` جدید بگذار و ری‌استارت |

## 🆘 عیب‌یابی سریع
- بات آنلاین ولی وب نه → `WEB_PORT`/`PORT` ست است؟ لاگ: `web: ON :PORT` در بنر run.py
- `healthz` قدیمی → نسخه در `config.py`
- PWA نصب نمی‌شود → فقط روی HTTPS ثبت می‌شود
- SSE بی‌-data → nginx `proxy_buffering off` (بالا)

## 🔧 بیلد Railway هنگ کرد؟ («Building the image…» بی‌پایان)
1. **اول دپلوی‌های تکراری رو لغو کن:** Deployments ← روی هرکدوم ⋮ ← Cancel/Remove.
   پلن Hobby فقط «یک بیلد همزمان» دارد — ۲-۳ دپلوی پشت‌سرهم یعنی صف و هنگ ظاهری.
2. **Docker Hub rate-limit:** چند بیلد پشت‌سرهم، پول‌های ناشناس یک IP را محدود
   می‌کند و بیلد وسط pull می‌ماند → از 0.6.2 پایهٔ ایمیج `mirror.gcr.io` است.
3. بعد از لغو همه، فقط **یک** Redeploy بزن و لاگ بیلد را ببین: باید به‌ترتیب
   `FROM` ← `pip install` ← `COPY` جلو برود.
4. باز هنگ کرد؟ [status.railway.app](https://www.railwaystatus.io/) را چک کن —
   مشکل از بیلدر Railway است نه پروژهٔ تو.
5. سرویس «Unexposed» است؟ بات کار می‌کند ولی وب/پنل بیرون دیده نمی‌شود →
   Settings ← Networking ← Generate Domain (پورت 8080).
