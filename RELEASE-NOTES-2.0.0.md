# DropAgentX v2.0.0 — یادداشت انتشار / Release Notes

> **نسخه ۲.۰.۰ — توزیع کامل (Complete Distribution)**
> اولین نسخه‌ای که همه‌چیز در یک بسته است: سورس کامل، دو نصب‌کننده ویندوز، اپلیکیشن اندروید، کیت گرافیک و داده‌های بازیابی‌شده‌ی شما.

---

## 🇮🇷 فارسی

### این نسخه چیست؟
نسخه ۲.۰.۰ «نسخه‌ی انتشار» (Release) پروژه DropAgentX است؛ سوپراپ تلگرامی کسب‌وکار با مارکت‌پلیس، کیف پول اعتباری، کوئست، سیستم معرفی، رزرو نوبت، حاکمیت HITL و شش ایجنت هوش مصنوعی. در این نسخه، به‌جای «فقط سورس»، **کل اکوسیستم محصول** بسته‌بندی شده است تا هر کسی — از کاربر ویندوزی تا توسعه‌دهنده و سرمایه‌گذار — در کمتر از پنج دقیقه صاحب یک نمونه کامل شود.

### محتوای بسته
| بخش | توضیح |
|---|---|
| `distribution/DropAgentX-Setup-2.0.0.exe` | نصب‌کننده کامل ویندوز (Electron) با مدیریت از سیستم‌تری، باز شدن خودکار داشبورد و داده‌های بازیابی‌شده |
| `distribution/DropAgentX-Lite-Setup-2.0.0.exe` | نصب‌کننده سبک فارسی (NSIS) — ویزارد فارسی راست‌به‌چپ، ساخت خودکار کلیدهای امنیتی، گزینه اجرای خودکار، حذف با پشتیبان‌گیری دیتابیس |
| `distribution/DropAgentX-2.0.0.apk` | اپلیکیشن اندروید (همراه داشبورد) با رابط فارسی Aurora — امضاشده با scheme v2+v3 |
| `art/` | کیت گرافیک: بنر انتشار ۱۹۲۰×۱۰۸۰، کارت شبکه اجتماعی ۱۲۰۰×۶۳۰، لوگوی ۱۰۲۴، آیکون اپ و ICO |
| ریشه بسته | سورس کامل TypeScript، `dist/` آماده، لوکال‌های ۲۵ زبان، اسکیمای Prisma، داکر و CI، تست‌ها و گالری اسکرین‌شات‌ها |

### امنیت (ارث‌رسیده از ۱.۳.۰ و حفظ‌شده)
- اعتبارسنجی پرداخت پیش از `pre_checkout_query` — جلوگیری از تحویل قبل از تسویه
- claim اتمیک HITL با `updateMany` و nonce — بدون دوباره‌پرداخت و race
- کلید داشبورد با مقایسه timing-safe + قفل نرخ خطای احراز
- توکن HMAC پنج‌دقیقه‌ای برای جریان SSE
- پروجکشن امن `toPublicProduct` — بدون نشت `deliveryPayload` و `sellerId`
- کلیدهای `.env` این بسته **خالی** هستند؛ هر نصب، کلید اختصاصی خودش را در اولین اجرا می‌سازد

### داده‌های بازیابی‌شده
دیتابیس `db/custom.db` شامل مهاجرت کامل مارکت‌پلیس قبلی شماست: ۴۶۶ کاربر، ۳۰ محصول، ۱۱۱ سفارش، ۱٬۵۶۹ تراکنش و ۲۴۷ معرفی — با **تطابق کامل دفتر کل: مجموع کیف پول‌ها = مجموع تراکنش‌های NET = ۱۸۷٬۹۲۵ اعتبار (صفر مغایرت).**

### نصب سریع
- **ویندوز (پیشنهادی):** `DropAgentX-Setup-2.0.0.exe` → Next → Next → Finish. اگر SmartScreen هشدار داد: More info → Run anyway (باینری امضای فروشگاهی ندارد).
- **ویندوز سبک فارسی:** `DropAgentX-Lite-Setup-2.0.0.exe` → ویزارد فارسی → بعد از نصب `DropAgentX.cmd` را اجرا کنید؛ بار اول کلید داشبورد روی کنسول چاپ می‌شود.
- **اندروید:** فایل APK را روی گوشی باز کنید → اجازه نصب منابع ناشناس → نصب. در اولین اجرا، آدرس سرور (`http://IP-رایانه:3000`) و کلید داشبورد را وارد کنید.
- **سرور/داکر:** `npm install && npm run build && npm start` یا `docker compose up`.

### نقشه راه (کشور دیجیتال)
گام ۱ (مجلس رهبران فناوری) ✅ · گام ۲ (نمادهای ملی) ⏳ · گام ۳ اقتصاد بسته · گام ۴ مجلس · گام ۵ دولت AI · گام ۶ منشور نگهداشت.

---

## 🇬🇧 English

### What is this release?
v2.0.0 is the **Complete Distribution** of DropAgentX — the Telegram business super-app (marketplace, credit wallet, quests, referrals, bookings, HITL governance, 6 AI agents). For the first time everything ships in one package: full source, two Windows installers, an Android companion APK, a graphics kit, and the recovered production dataset.

### What's inside
- **Full source** (TypeScript + Express + grammY + Prisma/SQLite), prebuilt `dist/`, 25 locales, Docker & CI, tests, screenshots gallery.
- **Windows:** full Electron installer (tray-managed local host) + Lite Farsi NSIS installer (auto-generated secrets, optional autostart, DB-backup uninstall).
- **Android:** signed WebView companion (Aurora RTL UI, persisted server URL + dashboard key).
- **Art kit:** release banner, social card, logo, app icons.
- **Data:** `db/custom.db` — fully reconciled ledger (Σ wallets = Σ NET transactions = 187,925 credits, zero mismatch).

### Security posture
Payment pre-validation, atomic HITL claims, timing-safe key auth with lockout, HMAC-gated SSE streams, safe public projections, blank shipped secrets with per-install key generation.

### License
MIT — build, ship, and make it yours.
