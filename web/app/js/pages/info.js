/* DropAgentX v2.0 — INFO SUITE: settings / help / about / terms / privacy /
   roadmap / bot / status */
DGX.pages = DGX.pages || {};

const _docPage = (icon, title, sub, bodyHtml) => async (view) => {
  view.innerHTML = `
    <div class="col-head">${DGX.icon(icon)} <b>${title}</b><span>${sub}</span></div>
    <div class="post" style="padding:16px">${bodyHtml}</div>`;
};

DGX.pages.settings = async (view) => {
  const rows = [
    ['user', 'حساب من', DGX.user ? `@${DGX.user.username || DGX.user.id}` : 'لاگین نشده', '#/profile-edit'],
    ['wallet', 'کیف پول و پرداخت', 'شارژ، برداشت، تراکنش‌ها', '#/transactions'],
    ['bell', 'اعلان‌ها', 'فعالیت فروش و کیف پول', '#/notifications'],
    ['shield', 'امنیت', 'ورود فقط از تلگرام — بدون رمز جدا', '#/about'],
    ['palette', 'ظاهر', 'تم NEON — تنها تم رسمی', '#/settings'],
    ['info', 'راهنما و پشتیبانی', 'سؤالات پرتکرار', '#/help'],
    ['doc', 'قوانین و حریم خصوصی', 'متن کامل', '#/terms'],
    ['rocket', 'نقشه‌ی راه', 'از v1.0 تا v2.0 و بعدش', '#/roadmap'],
  ];
  view.innerHTML = `
    <div class="post" style="padding:6px 0">
      ${rows.map(([ic, t, d, h]) => `
        <a class="set-row" href="${h}">
          <span class="nr-ic">${DGX.icon(ic)}</span>
          <div style="flex:1"><b>${t}</b><span class="p-sub">${d}</span></div>
          <span class="cc-go">${DGX.icon('chevron-l','ic-s')}</span></a>`).join('')}
    </div>
    <p class="page-hint" style="text-align:center;margin-top:14px">DropAgentX v${(window.DGX_VERSION || '2.0.0')} «گrand Bazaar» · ۵۰ صفحه</p>`;
};

DGX.pages.help = _docPage('info', 'راهنما', 'سؤالات پرتکرار', `
  ${[['چطور محصول بخرم؟', 'کارت محصول → «خرید فوری» → شییت تأیید → دانلود. موجودی کردیت لازم است؛ از صفحه‌ی واریز شارژ کن.'],
     ['چطور بفروشم؟', 'دکمه‌ی + در نوار پایین → ویزارد ۴ مرحله‌ای (اطلاعات، قیمت، ۳ عکس، انتشار). ادمین تأیید می‌کند و در بازار می‌نشیند.'],
     ['کردیت چطور شارژ می‌شود؟', 'از بات با /deposit — معادل دلاری همان لحظه نشان داده می‌شود.'],
     ['فایل خریدم را کجا پیدا کنم؟', 'صفحه‌ی «کتابخانه‌ی من» — همه‌ی دانلودهای همیشگی آنجاست.'],
     ['دراپ چیست؟', 'موج فروش محدود برای یک محصول — از «ساخت دراپ» راه می‌افتد و در صفحه‌ی دراپ‌ها می‌نشیند.'],
     ['پشتیبانی؟', 'همان بات: /support — معمولاً زیر چند ساعت پاسخ.']]
    .map(([q, a]) => `<details class="acc"><summary>${q}</summary><p>${a}</p></details>`).join('')}`);

DGX.pages.about = _docPage('spark', 'درباره‌ی DropAgentX', 'بازار محصولات دیجیتال داخل تلگرام', `
  <p style="line-height:2.2;color:var(--dim)">
    DropAgentX یک <b style="color:var(--txt)">مارکت‌پلیس اجتماعی</b> است که کامل داخل تلگرام زندگی می‌کند:
    بات برای پرداخت و فروش، و همین وب‌اپ برای گشتن و خرید.<br><br>
    ${DGX.icon('flame','ic-s')} فید «برای تو» با سیگنال‌های واقعی تو شخصی‌سازی می‌شود<br>
    ${DGX.icon('shop','ic-s')} هر کاربر می‌تواند فروشگاه بسازد<br>
    ${DGX.icon('bot','ic-s')} هرمسا، ایجنت هوشمند، همیشه آنلاین است<br>
    ${DGX.icon('shield','ic-s')} پرداخت با کردیت و تسویه‌ی شفاف
  </p>
  <div class="stat-grid" style="margin-top:12px">
    <div class="stat-card"><span>صفحات اپ</span><b class="num">۵۰</b></div>
    <div class="stat-card"><span>آیکون SVG</span><b class="num">۵۴</b></div>
    <div class="stat-card"><span>تم</span><b>NEON</b></div>
    <div class="stat-card"><span>نسخه</span><b class="num">2.0.0</b></div>
  </div>`);

DGX.pages.terms = _docPage('doc', 'قوانین', 'استفاده از DropAgentX', `
  ${['فقط محصول دیجیتالِ متعلق به خودت؛ فایل دارای کپی‌رایت دیگران ممنوع.',
     'قیمت‌گذاری با کردیت؛ کارمزد بازار در لحظه‌ی فروش شفاف کسر می‌شود.',
     'ادمین می‌تواند محصول غیرمجاز را رد یا حذف کند.',
     'بازگشت وجه در صورت خرابی فایل، تا ۴۸ ساعت.',
     'اسپم و دستکاری الگوریتم فید (سایکلایک) = مسدودی.',
     'برداشت از ۱۰۰ کردیت، تا ۲۴ ساعت پردازش.']
    .map((t, i) => `<div class="sumrow"><span>ماده‌ی ${i + 1}</span><b style="max-width:75%;text-align:start;font-weight:500;line-height:1.9">${t}</b></div>`).join('')}
  <a class="btn btn-ghost" style="margin-top:8px" href="#/privacy">حریم خصوصی ←</a>`);

DGX.pages.privacy = _docPage('shield', 'حریم خصوصی', 'داده‌ی حداقلی', `
  <p style="line-height:2.2;color:var(--dim)">
    فقط چیزی که برای کار لازم است ذخیره می‌شود: شناسه‌ی تلگرام، نام، تراکنش‌ها و فایل‌های خودت.
    نه شماره‌ی تلفن می‌خواهیم، نه ایمیل، نه کوکی ردیاب.<br><br>
    پسندها و ذخیره‌ها روی <b style="color:var(--txt)">دستگاه خودت</b> نگه‌داری می‌شوند (localStorage) و با پاک‌کردن مرورگر حذف می‌شوند.
  </p>`);

DGX.pages.roadmap = _docPage('rocket', 'نقشه‌ی راه', 'از ۱.۰ تا ۲.۰', `
  ${[['v1.0', 'پلتفرم کامل: بات، کیف، تسک، پنل ادمین'],
     ['v1.1', 'موبایل‌فرست: UI نقش‌محور، اسکلتون، پول‌ریفرش'],
     ['v1.2.1', 'لایه‌ی اینستاگرام: فید «برای تو» شخصی، Share-to-DM'],
     ['v1.2.1+', '۵۰ آیکون SVG — خداحافظ اموجی'],
     ['v1.3.0', 'تم NEON + شییت تأیید خرید + اورلی موفقیت'],
     ['v2.0.0', 'گرند بازار: ۵۰ صفحه، ریلز، استوری، دراپ، داشبورد فروشنده']]
    .map(([v, t]) => `<div class="notif-row"><span class="rank-badge">${v.split('.')[0] === '1' ? '1' : v[1]}</span>
      <div style="flex:1"><b>${v}</b><span class="p-sub" style="display:block">${t}</span></div>
      ${v === 'v2.0.0' ? '<span class="pill p-live">همین حالا</span>' : '<span class="p-sub">✓</span>'}</div>`).join('')}
  <p class="page-hint" style="margin-top:10px">بعدی: استوری نوتیف‌کرافت، treasury خودکار، موتور اسکرو</p>`);

DGX.pages.bot = async (view) => {
  const cmds = [
    ['/start', 'شروع + منوی کامل + ۵۰ کردیت خوش‌آمدگانی'],
    ['/deposit N', 'شارژ N کردیت'],
    ['/withdraw', 'درخواست برداشت'],
    ['/profile', 'تغییر نام و بایو'],
    ['/drop …', 'ثبت دراپ ویژه'],
    ['/referral', 'کد دعوت و پاداش‌ها'],
    ['/support', 'پشتیبانی انسانی'],
  ];
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('send','ic-s')} بات، مغز مالی DropAgentX است — همه‌ی پرداخت‌ها آنجا</p>
    ${cmds.map(([c, d]) => `
      <div class="notif-row" onclick="DGX.openBot('${c.split(' ')[0]}')">
        <span class="nr-ic">${DGX.icon('bot')}</span>
        <div style="flex:1"><b class="num" style="direction:ltr;display:inline-block">${c}</b>
          <span class="p-sub" style="display:block">${d}</span></div>
        <span class="cc-go">${DGX.icon('chevron-l','ic-s')}</span></div>`).join('')}`;
};

DGX.pages.status = async (view) => {
  view.innerHTML = DGX.skelCards(1);
  const checks = [];
  try { const h = await DGX.api('/healthz'); checks.push(['سرور اپ', h.version || '?', true]); }
  catch (e) { checks.push(['سرور اپ', 'بی‌پاسخ', false]); }
  try { const i = await DGX.api('/api/pub/info');
    checks.push(['بات', i.bot_username || 'DropAgentXBot', true]);
    checks.push(['دسته‌های فعال', String((i.categories || []).length), true]); }
  catch (_) { checks.push(['اطلاعات عمومی', 'خطا', false]); }
  try { await DGX.api('/api/app/categories'); checks.push(['API دسته‌ها', 'سالم', true]); }
  catch (_) { checks.push(['API دسته‌ها', 'خطا', false]); }
  try { await DGX.api('/api/app/trending?limit=3'); checks.push(['API ترندها', 'سالم', true]); }
  catch (_) { checks.push(['API ترندها', 'خطا', false]); }
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('live','ic-s')} وضعیت زنده‌ی سرویس‌ها — همین لحجه چک شد</p>
    ${checks.map(([t, v, ok]) => `
      <div class="notif-row">
        <span class="nr-ic" style="${ok ? '' : 'color:var(--red)'}">${DGX.icon(ok ? 'check' : 'info')}</span>
        <div style="flex:1"><b>${t}</b></div>
        <b style="color:${ok ? 'var(--em)' : 'var(--red)'}">${DGX.esc(String(v))}</b>
      </div>`).join('')}
    <p class="page-hint" style="margin-top:10px;text-align:center">آپتایم رسمی روی UptimeRobot /healthz</p>`;
};
