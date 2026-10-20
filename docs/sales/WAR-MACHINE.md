# ⚔️ War Machine — عملیات فروش روزانه (قیف لید → £150)

> بخش عملیاتی KIAdropAgentX: لید از معدن **Hermes** می‌آید، اینجا ایمپورت،
> غربال و پیگیری می‌شود، پیام سه‌کاناله ساخته می‌شود و معامله £150/48h بسته می‌شود.
> اجرای این نسخه: دکمه **🤝 CRM لیدها** در پنل ادمین (`/crm`) یا `/crm` داخل ربات.

---

## ۱) چرخه کار روزانه (۵ قدم)

1. **ایمپورت لید** — خروجی JSON هرمس را در `/crm` پیست کن (دی‌دوپ خودکار روی
   `business + city`؛ گزارش `{created, duplicates, skipped}` برمی‌گردد).
2. **چک‌لیست کیفیت** هر لید (قبل از صرف وقت):
   - [ ] `sourceUrl` کلیک‌پذیر و درست است
   - [ ] ریتینگ بین ۴٫۰ تا ۵٫۰
   - [ ] ریویو بین ۵۰ تا ۱۰۰۰ (نشانه کسب‌وکار زنده، نه غول زنجیره‌ای)
   - [ ] مستقل باشد (نه زنجیره‌ای)
   - [ ] `website` برابر `null` باشد (لید واقعی = بدون سایت)
3. **۳ کاندید برتر** را جدا کن → استیج را به `warm` ببر.
4. **ارسال دستی** پیام‌ها (IG DM / ایمیل / واتساپ) — پیام‌ها پیش‌نویس‌اند، خودت بفرست.
5. **دمو → فروش:** تأیید دمو → £150 فلت → تحویل ۴۸ ساعت → استیج `won`.

## ۲) استیج‌های CRM

| استیج | معنی | کی عوض شود |
|---|---|---|
| 🆕 `new` | تازه ایمپورت‌شده | پیش‌فرض بعد از import |
| 🔥 `warm` | پیام رفت / جواب داده | بعد از ارسال یا پاسخ |
| 💰 `won` | معامله £150 بسته شد | بعد از تأیید + پرداخت |
| ❌ `lost` | جواب نداد / رد کرد | بعد از ۲ فالوآپ بی‌جواب |

## ۳) قالب پیام سه‌کاناله (لندن — انگلیسی)

### کانال ۱ — Instagram DM (کوتاه، خودمونی)
```
Hey {business_name}! 👋 Found you on Google Maps — {reviews} reviews and a {rating}★
spot in {city} is seriously impressive. Noticed there's no website yet — I build
beautiful one-page sites for independent restaurants in 48h, £150 flat, and you
only pay once you've approved the demo. Want me to build a free preview for you?
```

### کانال ۲ — Email (جدی‌تر، حرفه‌ای)
```
Subject: A free website preview for {business_name}

Hi {owner},

I came across {business_name} on Google Maps — {rating}★ from {reviews} reviews
in {city}. One thing surprised me: no website.

I'm offering independent restaurants a one-page site (menu, photos, bookings,
Instagram feed) built in 48 hours for a flat £150 — and you pay only after you've
seen and approved your live demo, zero risk.

I've already prepared a preview for {business_name}. Want the link?

Best,
{name}
```

### کانال ۳ — واتساپ/SMS (حداکثر ۲ جمله)
```
Hi! This is {name} — I build 48h websites for independent restaurants in {city}.
Made a free preview of {business_name}'s site. Pay (£150) only if you love it. Want the link?
```

**قوانین پیام:** هر پیام یک سؤال · بدون لینک در پیام اول · بدون وعده سئو/فیک ·
فالوآپ بعد ۴۸ ساعت سکوت.

## ۴) اسکریپت بستن (پس از پاسخ)

```
Great! Here's how it works:
1. I build your live demo in 48 hours — you see it first.
2. You approve (unlimited small tweaks).
3. You pay £150 flat — only after you approve. No upfront cost.
4. Delivered: one-page site with menu, photos, reviews, Instagram + Google Maps link.
Anything specific you want on it? (menu PDF / photos / booking link)
```

## ۵) قرارداد JSON ایمپورت

```json
[
  {
    "business": "Pasta Fresca",
    "category": "Italian restaurant",
    "city": "London",
    "rating": 4.6,
    "reviews": 187,
    "instagram": "@pastafresca.ldn",
    "website": null,
    "sourceUrl": "https://www.google.com/maps/place/...",
    "address": "12 Old Compton St, London",
    "phone": "+44 20 7xxx xxxx",
    "notes": "family-run, closed Mondays"
  }
]
```

کلیدهای جایگزین هم پذیرفته می‌شوند: `name/title` → business · `type/cuisine` →
category · `area/neighborhood` → city · `stars` → rating · `ig/handle` →
instagram · `url/link` → sourceUrl.

## ۶) سه مسیر ایمپورت (همه با دی‌دوپ خودکار)

| مسیر | کی | چطور |
|---|---|---|
| وب‌CRM | دستی | پنل ادمین → 🤝 CRM لیدها → پیست JSON → ایمپورت |
| خط فرمان | اسکریپت | `python tools_validate_leads.py leads.json` سپس پیست در `/crm` |
| API | خودکار | `curl -X POST $BASE/api/hermes/import -H "x-crm-token: $CRM_TOKEN" -H "Content-Type: application/json" --data @leads.json` |

نمونه گزارش موفق:
`{"ok": true, "created": 8, "duplicates": 2, "skipped": 0, "errors": []}`

## ۷) خطوط قرمز (شکنی ندارد)

1. AI فقط پیش‌نویس — ارسال انسانی (مگر پیام روتین)
2. بدون جعل ریویو، بدون فیک، بدون وعده‌ی ۲۴ساعته
3. پرداخت فقط بعد از تأیید دمو توسط مشتری
4. حریم داده: فقط اطلاعات عمومی دایرکتوری‌ها
