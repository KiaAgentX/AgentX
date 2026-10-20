/* DropAgentX v2.0 — SITEMAP: the living map of all 50 pages */
DGX.pages = DGX.pages || {};
DGX.SITEMAP = [
  ['فید و کشف', 'flame', [['home','خانه','foryou'],['explore','کشف','mosaic'],['reels','ریلز','vertical'],['drops','دراپ‌های زنده','countdown'],['trending','ترندها','rank'],['fresh','تازه‌ها','time'],['story','استوری‌ویوئر','fullscreen'],['search','جستجو','query']]],
  ['بازار', 'shop', [['categories','دسته‌ها','grid'],['category','صفحه‌ی دسته','filter'],['collections','کالکشن‌ها','curated'],['collection','یک کالکشن','set'],['product','محصول','detail'],['related','مشابه‌ها','same-cat'],['reviews','دیدگاه‌ها','list'],['seller','فروشگاه عمومی','storefront']]],
  ['خرید', 'cart', [['order','سفارش','receipt'],['library','کتابخانه‌ی من','owned'],['plans','پلن فروشنده','tiers'],['credits','کردیت چیست','info']]],
  ['اجتماعی', 'users', [['people','خالق‌های برتر','leaderboard'],['follows','فالوها','list'],['notifications','اعلان‌ها','bell'],['likes','پسندها','heart'],['saved','ذخیره‌ها','bookmark'],['profile','پروفایل','me'],['profile-edit','ویرایش پروفایل','form'],['share','مرکز دعوت','gift']]],
  ['فروشنده', 'rocket', [['create','ساخت محصول','wizard'],['create-drop','ساخت دراپ','flame'],['drafts','پیش‌نویس‌ها','docs'],['dashboard','داشبورد','stats'],['analytics','تحلیل','charts'],['products-manage','محصولات من','manage'],['payouts','تسویه','money']]],
  ['کیف پول', 'wallet', [['wallet','کیف پول','balance'],['deposit','واریز','in'],['withdraw','برداشت','out'],['transactions','تراکنش‌ها','history']]],
  ['ایجنت و سیستم', 'bot', [['agent','هرمسا','chat'],['settings','تنظیمات','prefs'],['help','راهنما','faq'],['about','درباره','info'],['terms','قوانین','doc'],['privacy','حریم خصوصی','shield'],['roadmap','نقشه‌ی راه','timeline'],['bot','دستورات بات','cmd'],['status','وضعیت سرویس','live'],['activity','فعالیت','log'],['sitemap','همین صفحه','map']]],
];
DGX.pages.sitemap = async (view) => {
  const total = DGX.SITEMAP.reduce((n, g) => n + g[2].length, 0);
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('compass','ic-s')} نقشه‌ی کامل وب‌اپ — <b class="num">${total}</b> صفحه‌ی به‌هم‌متصل که بازار DropAgentX را می‌سازند</p>
    ${DGX.SITEMAP.map(([g, ic, pages]) => `
      <h3 style="margin:16px 0 8px;display:flex;align-items:center;gap:6px">${DGX.icon(ic,'ic-s')} ${g}
        <span class="p-sub">(${pages.length})</span></h3>
      <div class="sm-grid">
        ${pages.map(([k, t, d]) => `<a class="sm-cell" href="#/${k}"><b>${t}</b><span>${d}</span></a>`).join('')}
      </div>`).join('')}
    <p class="page-hint" style="margin-top:16px;text-align:center">هر جا گم شدی، از تنظیمات ← نقشه‌ی ۵۰ صفحه به اینجا برمی‌گردی</p>`;
};
