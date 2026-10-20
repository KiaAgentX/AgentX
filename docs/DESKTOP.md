# 🖥️ وب‌اپ · موبایل · دسکتاپ — راهنمای بهینه‌سازی

KIAdropAgentX یک **PWA کامل** است: یک کد، سه مقصد (مرورگر، گوشی، دسکتاپ).

## ۱) وب‌اپ (مرورگر)

- مسیرها: `/` فروشگاه عمومی · `/admin` پنل ادمین · `/crm` داشبورد لیدها ·
  `/login` ورود · `/links` هاب لینک‌ها · `/insights` داشبورد تحلیل
- سرو استاتیک: سرور داخلی (FastAPI + StaticFiles) — CDN لازم نیست
- بهینه‌سازی‌های موجود:
  - SW (`web/sw.js`) با کش offline-first برای صفحات عمومی
  - `manifest.webmanifest` + آیکون‌های ۱۹۲/۵۱۲/maskable
  - فونت خودمیزبان (Vazirmatn woff2) — بدون وابستگی به گوگل‌فونت در بحرانی‌ترین مسیرها
  - تصاویر بهینه، منابع سه‌بعدی Three.js فقط در صفحهٔ showcase

## ۲) موبایل (نصب به‌عنوان اپ)

**Android / Chrome:**
1. سایت را باز کن → منوی مرورگر → **Add to Home screen** → **Install**
2. آیکون جدا، حالت standalone، بدون نوار مرورگر

**Telegram Mini App:** لینک وب‌اپ داخل ربات (دکمه‌های موجود) — در WebView تلگرام باز می‌شود؛
کوکی `happ` اختصاصی همین context را پشتیبانی می‌کند.

**iOS / Safari:** Share → **Add to Home Screen** (PWA iOS با محدودیت سرویس‌ورکر؛
مسیرهای عمومی کش می‌شوند).

## ۳) دسکتاپ (ویندوز/مک/لینکس)

**روش A — نصب PWA از Edge/Chrome (بدون کد):**
1. سایت را در مرورگر باز کن
2. آیکون **Install** در نوار آدرس (یا منو ⋮ → Apps → Install this site as an app)
3. اپ مستقل با آیکون خودش در Start/Dock/Launcher

**روش B — میان‌بر سفارشی (سریع‌ترین راه):**
```powershell
# ویندوز — میان‌بر با آیکون وب‌اپ
$m=[Environment]::GetFolderPath('Desktop')
$s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut("$m\DropAgentX.lnk")
$l.TargetPath="msedge:http://localhost:8080/admin"; $l.Save()
```

**روش C — TWA / WebView بومی (برای توزیع):**
- پوشهٔ `admin/twa.html` در نسخه‌های Zenovix الگوی Trusted Web Activity دارد؛
  برای همین پروژه می‌توانی از ابزار **PWABuilder** (خروجی APK/TWA) استفاده کنی:
  دامنهٔ Railway را بده → خروجی اندروید بگیر.

## ۴) چک‌لیست عملیاتی قبل از ارائه به مشتری

- [ ] لینک از **گوشی واقعی** تست شده (مشتری موبایل را باز می‌کند)
- [ ] PWA روی دسکتاپ نصب و آیکون چک شده
- [ ] `/healthz` سبز است
- [ ] بعد از تغییر `BRAND_*`: کش سرویس‌ورکر پاک شده (نسخهٔ SW تغییر کرده؟)
- [ ] لاگین ادمین با `WEB_SECRET` درست کار می‌کند

## ۵) نکات عملکردی

| موضوع | وضعیت |
|---|---|
| کش استاتیک | Service Worker + هدر cache سرور |
| حالت آفلاین | `offline.html` برای مسیرهای عمومی |
| حجم دیتابیس | VACUUM ماهانه + آرشیو تراکنش + سقف `DB_WARN_MB` |
| فایل‌های سنگین | آپلود در کانال تلگرام با `file_id` (`FILE_STORAGE_CHANNEL_ID`) — صفر بایت Volume |
| لاج JSON | برای Railway — `LOG_JSON_ENABLED=1` |
