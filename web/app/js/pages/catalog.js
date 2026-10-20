/* DropAgentX v2.0 — CATALOG SUITE: categories / category / collections / collection */
DGX.pages = DGX.pages || {};

DGX.pages.categories = async (view) => {
  view.innerHTML = DGX.skelCards(2);
  let c;
  try { c = (await DGX.api('/api/app/categories')).items; }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('puzzle','ic-s')} ${c.filter(x => x.count > 0).length} دسته‌ی فعال — بازار را از اینجا بگرد</p>
    <div class="cat-grid-big">
      ${c.map(k => `
        <a class="cat-big ${k.count ? '' : 'mute'}" href="#/category?key=${k.key}">
          <span class="cb-ic">${DGX.catIcon(k.key)}</span>
          <b>${DGX.esc(k.fa)}</b>
          <span>${DGX.kfmt(k.count || 0)} محصول</span>
        </a>`).join('')}
    </div>
    <div style="text-align:center;padding:14px"><a class="lnk" href="#/sitemap">نقشه‌ی کامل ۵۰ صفحه ←</a></div>`;
};

DGX.pages.category = async (view, params) => {
  const key = params.key || 'all';
  const SORTS = { hot: ['پرفروش', (a, b) => (b.sales_count || 0) - (a.sales_count || 0)],
                  cheap: ['ارزان‌تر', (a, b) => (a.price_credits || 0) - (b.price_credits || 0)],
                  new: ['جدیدتر', (a, b) => (b.created_at || 0) - (a.created_at || 0)] };
  const s = SORTS[params.sort] ? params.sort : 'hot';
  let title = 'دسته', cats = [];
  try { cats = (await DGX.api('/api/app/categories')).items;
    title = (cats.find(c => c.key === key) || {}).fa || 'دسته'; } catch (_) {}
  view.innerHTML = `
    <div class="seg" style="margin-bottom:10px">
      ${Object.entries(SORTS).map(([k, v]) =>
        `<button class="${s === k ? 'on' : ''}" onclick="location.hash='#/category?key=${key}&sort=${k}'">${v[0]}</button>`).join('')}
    </div>
    <div class="mosaic" id="mg">${DGX.icon('box','big-ic ph-g')} در حال بارگذاری…</div>
    <div id="more" style="text-align:center;color:var(--dim2);padding:12px"></div>`;
  let cursor = 0, ended = false, all = [];
  const grid = DGX.$('#mg');
  async function load() {
    if (ended) return;
    try {
      const d = await DGX.api(`/api/app/feed?mode=foryou&cat=${encodeURIComponent(key)}&cursor=${cursor}`);
      ended = d.next === null; cursor = d.next ?? cursor; all = all.concat(d.items);
      const rows = [...all].sort(SORTS[s][1]);
      grid.innerHTML = rows.map(DGX.tile).join('') ||
        `<div class="empty" style="grid-column:1/-1"><div class="big">${DGX.icon('box','big-ic')}</div>
         اینجا هنوز خالیه<br><br><a class="btn btn-primary" href="#/create">${DGX.icon('plus','ic-s')} تو پرش کن</a></div>`;
      DGX.$('#more').textContent = ended ? '— پایان دسته —' : '…';
    } catch (e) { DGX.$('#more').textContent = e.msg || 'خطا'; ended = true; }
  }
  await load();
  window.onscroll = () => { if (innerHeight + scrollY > document.body.scrollHeight - 500 && !ended) load(); };
};

const COLS = {
  cheap: { t: 'جوون‌بازار', d: 'همه‌چیز زیر ۱۰۰ کردیت', icon: 'wallet',
           q: () => '/api/app/feed?mode=foryou&cursor=0', f: rows => rows.filter(p => p.price_credits <= 100) },
  best:  { t: 'پرفروش‌های تاریخ', d: 'محصولاتی که بیشترین فروش را داشته‌اند', icon: 'trophy',
           q: () => '/api/app/trending?limit=20', f: rows => rows },
  fresh: { t: 'تازه رسیده‌ها', d: 'آخرین ساخته‌شده‌ها توسط خالق‌ها', icon: 'deposit',
           q: () => '/api/app/feed?mode=foryou&cursor=0', f: rows => [...rows].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)) },
  loved: { t: 'محبوب‌ها', d: 'بیشترین پسندِ community', icon: 'heart',
           q: () => '/api/app/trending?limit=20', f: rows => [...rows].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)) },
};

DGX.pages.collections = async (view) => {
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('star-f','ic-s')} کالکشن‌های زنده — از داده‌ی واقعی بازار، هر روز به‌روز</p>
    <div class="col-grid">
      ${Object.entries(COLS).map(([k, c]) => `
        <a class="col-card" href="#/collection?kind=${k}">
          <span class="cc-ic">${DGX.icon(c.icon)}</span>
          <b>${c.t}</b><span>${c.d}</span>
          <i class="cc-go">${DGX.icon('chevron-l','ic-s')}</i>
        </a>`).join('')}
    </div>
    <div class="col-grid" style="margin-top:10px">
      <a class="col-card" href="#/categories"><span class="cc-ic">${DGX.icon('puzzle')}</span>
        <b>همه‌ی دسته‌ها</b><span>۱۳ دسته‌ی فعال بازار</span></a>
      <a class="col-card" href="#/trending"><span class="cc-ic">${DGX.icon('chart')}</span>
        <b>ترندها</b><span>۱۰ محصول برتر امروز</span></a>
    </div>`;
};

DGX.pages.collection = async (view, params) => {
  const c = COLS[params.kind];
  if (!c) { location.hash = '#/collections'; return; }
  view.innerHTML = `<div class="col-head">${DGX.icon(c.icon)} <b>${c.t}</b><span>${c.d}</span></div>
    <div class="mosaic" id="mg">${DGX.icon('box','big-ic ph-g')} …</div>`;
  try {
    const d = await DGX.api(c.q());
    const rows = c.f(d.items || []);
    DGX.$('#mg').innerHTML = rows.map(DGX.tile).join('') ||
      `<div class="empty" style="grid-column:1/-1"><div class="big">${DGX.icon('box','big-ic')}</div>فعلاً موردی نیست</div>`;
  } catch (e) { DGX.$('#mg').innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; }
};
