/* DropAgentX — hash router + bottom nav + topbar
   v1.1: role-aware topbar (admin shield only for admins), real notification
   dot (was a hardcoded fake), haptic nav taps, scroll reset per page. */
DGX.pages = {};

DGX.renderNav = () => {
  const items = [
    ['#/home', 'i-home', 'خانه'],
    ['#/explore', 'i-compass', 'کشف'],
    ['CREATE', null, null],                       // special ➕
    ['#/agent', 'i-spark', 'هرمسا'],
    ['#/profile', 'i-user', 'من'],
  ];
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  nav.setAttribute('role', 'tablist');
  for (const [hash, icon, label] of items) {
    if (hash === 'CREATE') {
      const d = document.createElement('div');
      d.className = 'bn-create';
      d.innerHTML = `<button title="ساخت محصول" aria-label="ساخت محصول" aria-role="tab"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>`;
      d.querySelector('button').onclick = () => { DGX.haptic('light'); location.hash = '#/create'; };
      nav.appendChild(d);
      continue;
    }
    const a = document.createElement('a');
    a.className = 'bn-item'; a.href = hash; a.dataset.hash = hash;
    a.setAttribute('role', 'tab'); a.setAttribute('aria-label', label);
    a.innerHTML = `<svg><use href="#${icon}"/></svg><span>${label}</span>`;
    a.onclick = () => DGX.haptic('light');
    nav.appendChild(a);
  }
};

DGX.renderTopbar = (title) => {
  const tb = document.getElementById('topbar');
  const unread = localStorage.getItem('dgx_unread') === '1';
  tb.innerHTML = `
    <img class="logo" src="/app/assets/logo.jpg" alt="DropAgentX" width="30" height="30">
    <span class="title">${title || ''}</span>
    <span class="spacer"></span>
    ${DGX.isAdmin() ? `<button class="icon-btn shield" onclick="location.href='/admin'" title="پنل مدیریت (ادمین)">
      ${DGX.icon('shield', 'ic-s')}
    </button>` : ''}
    <button class="icon-btn" style="position:relative" data-badge="${unread ? 1 : 0}"
      onclick="localStorage.setItem('dgx_unread','0');this.dataset.badge='0';location.hash='#/activity'" title="فعالیت">
      <svg width="18" height="18"><use href="#i-bell"/></svg><span class="dot"></span>
    </button>
    <button class="icon-btn" onclick="location.hash='#/search'" title="جستجو">
      <svg width="18" height="18"><use href="#i-search"/></svg>
    </button>`;
};

DGX.route = () => {
  const raw = (location.hash || '#/home').slice(2);          // "home?x=1"
  const [name, qs] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const page = name || 'home';
  const fn = DGX.pages[page];
  const fab = document.getElementById('hubFab');
  if (fab) fab.style.display = (page === 'product' || page === 'agent') ? 'none' : 'flex';
  document.querySelectorAll('.bn-item').forEach(a =>
    a.classList.toggle('on', a.dataset.hash === '#/' + page));
  const titles = {
    home: 'خانه', explore: 'کشف', search: 'جستجو',
    product: 'محصول', create: 'ساخت محصول', profile: 'پروفایل',
    wallet: 'کیف پول', activity: 'فعالیت', agent: 'هرمسا',
    reels: 'ریلز', drops: 'دراپ‌های زنده', trending: 'ترندها',
    fresh: 'تازه‌ها', story: 'استوری',
    categories: 'دسته‌ها', category: 'دسته', collections: 'کالکشن‌ها', collection: 'کالکشن',
    reviews: 'دیدگاه‌ها', seller: 'فروشگاه', related: 'مشابه‌ها', library: 'کتابخانه‌ی من',
    order: 'سفارش', plans: 'پلن فروشنده',
    notifications: 'اعلان‌ها', likes: 'پسندها', saved: 'ذخیره‌ها', people: 'خالق‌ها',
    follows: 'فالوها', 'profile-edit': 'ویرایش پروفایل', share: 'دعوت دوستان',
    'create-drop': 'ساخت دراپ', drafts: 'پیش‌نویس‌ها', dashboard: 'داشبورد فروشنده',
    analytics: 'تحلیل فروش', 'products-manage': 'محصولات من', payouts: 'تسویه',
    deposit: 'واریز', withdraw: 'برداشت', transactions: 'تراکنش‌ها', credits: 'کردیت',
    settings: 'تنظیمات', help: 'راهنما', about: 'درباره', terms: 'قوانین',
    privacy: 'حریم خصوصی', roadmap: 'نقشه‌ی راه', bot: 'دستورات بات',
    status: 'وضعیت سرویس', sitemap: 'نقشه‌ی ۵۰ صفحه',
  };
  DGX.renderTopbar(titles[page] || '');
  const view = document.getElementById('view');
  view.className = 'page';
  scrollTo(0, 0);                                  // mobile: every page starts at top
  if (!fn) { location.hash = '#/home'; return; }
  fn(view, params).catch(e => {
    if (e && e.silent) return;
    view.innerHTML = `<div class="empty"><div class="big">⚠️</div>${(e && e.msg) || 'خطا'}
      <br><br><button class="btn btn-ghost" onclick="history.back()">برگشت</button></div>`;
  });
};
