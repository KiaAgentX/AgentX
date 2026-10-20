/* DropAgentX v2.0 — COMMERCE SUITE: reviews / seller / related / library / order / plans */
DGX.pages = DGX.pages || {};

/* ── REVIEWS — full comment list of a product ── */
DGX.pages.reviews = async (view, params) => {
  const pid = +params.id; if (!pid) { location.hash = '#/home'; return; }
  view.innerHTML = DGX.skelCards(2);
  let d;
  try { d = await DGX.api(`/api/app/product/${pid}`); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const p = d.item, cms = d.comments || [];
  view.innerHTML = `
    <div class="col-head">${DGX.icon('comment')} <b>دیدگاه‌ها</b>
      <span>${p.title} · ${DGX.icon('star-f','ic-s star')} ${d.stars} از ${d.reviews} نظر</span></div>
    ${cms.length ? cms.map(c => `
      <div class="notif-row">
        <img class="avatar" style="width:34px;height:34px" src="/app/assets/logo.jpg">
        <div style="flex:1;min-width:0">
          <b>${DGX.esc(c.name || c.username || 'کاربر')}</b>
          <p style="color:var(--dim);font-size:12.5px;line-height:1.8;margin-top:2px">${DGX.esc(c.text)}</p>
        </div>
        <span class="p-sub">${DGX.timeAgo(c.created_at || Date.now()/1000)}</span>
      </div>`).join('') : `<div class="empty"><div class="big">${DGX.icon('comment','big-ic')}</div>اولین دیدگاه را بنویس<br><br>
        <a class="btn btn-primary" href="#/product?id=${pid}">رفتن به محصول</a></div>`}
    <a class="lnk" style="display:block;text-align:center;padding:10px" href="#/product?id=${pid}">← صفحه‌ی محصول</a>`;
};

/* ── SELLER — public storefront (0xBazaar #19 DNA) ── */
DGX.pages.seller = async (view, params) => {
  const uid = +params.uid; if (!uid) { location.hash = '#/people'; return; }
  view.innerHTML = DGX.skelCards(2);
  let s;
  try { s = await DGX.api(`/api/app/store/${uid}`); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'فروشگاه پیدا نشد'}</div>`; return; }
  const isMe = s.is_me;
  view.innerHTML = `
    <div class="store-hero">
      ${s.cover_url ? `<img class="cover" src="${DGX.esc(s.cover_url)}">` : '<div class="cover"></div>'}
      ${s.avatar_url ? `<img class="logo" src="${DGX.esc(s.avatar_url)}">`
                     : `<span class="logo">${DGX.icon('user')}</span>`}
      <b>${DGX.esc(s.name || 'فروشگاه')}</b>
      <span class="p-sub">@${DGX.esc(s.username || '')} ${DGX.icon('check','ic-xs vf')}</span>
      <div class="store-stats">
        <span><b class="num">${DGX.kfmt(s.followers)}</b> فالوور</span>
        <span><b class="num">${DGX.kfmt(s.products.length)}</b> محصول</span>
        <span><b class="num">${DGX.kfmt(s.total_sales)}</b> فروش</span>
      </div>
      <div class="post-actions" style="padding:12px 0 0">
        ${isMe
          ? `<a class="btn btn-ghost" href="#/profile">${DGX.icon('user','ic-s')} پروفایل من</a>`
          : `<button class="btn ${s.following_me ? 'btn-ghost' : 'btn-primary'}" id="folBtn">
               ${s.following_me ? DGX.icon('check','ic-s') + ' فالو می‌کنی' : '+ فالو'}</button>`}
        <button class="btn btn-ghost" data-share="1">${DGX.icon('link','ic-s')} اشتراک فروشگاه</button>
      </div>
    </div>
    <h3 style="margin:16px 0 10px;display:flex;align-items:center;gap:6px">${DGX.icon('shop','ic-s')} ویترین</h3>
    <div class="mosaic">${s.products.map(DGX.tile).join('') ||
      `<div class="empty" style="grid-column:1/-1">هنوز محصولی ندارد</div>`}</div>`;
  const fb = DGX.$('#folBtn');
  if (fb) fb.onclick = async () => {
    if (!DGX.requireAuth('فالو')) return;
    const on = !fb.dataset.on; fb.dataset.on = on ? '1' : '';
    try {
      await DGX.api('/api/app/follow', { body: { target: uid, on: !!on } });
      fb.className = 'btn ' + (on ? 'btn-ghost' : 'btn-primary');
      fb.innerHTML = on ? DGX.icon('check','ic-s') + ' فالو می‌کنی' : '+ فالو';
      DGX.toast(on ? 'فالو شدی ✅' : 'آنفالو شدی');
    } catch (e) { DGX.toast(e.msg || '', true); }
  };
};

/* ── RELATED — same-category products ── */
DGX.pages.related = async (view, params) => {
  const pid = +params.id; if (!pid) { location.hash = '#/home'; return; }
  view.innerHTML = DGX.skelCards(2);
  let d;
  try { d = await DGX.api(`/api/app/product/${pid}`); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const p = d.item;
  try {
    const f = await DGX.api(`/api/app/feed?mode=foryou&cat=${encodeURIComponent(p.category || 'all')}&cursor=0`);
    const rows = f.items.filter(x => +x.id !== pid).slice(0, 12);
    view.innerHTML = `
      <div class="col-head">${DGX.icon('puzzle')} <b>مشابه‌های «${DGX.esc(p.title)}»</b>
        <span>دسته‌ی ${DGX.esc(p.category)}</span></div>
      <div class="mosaic">${rows.map(DGX.tile).join('') ||
        `<div class="empty" style="grid-column:1/-1"><div class="big">${DGX.icon('box','big-ic')}</div>مشابهی پیدا نشد</div>`}</div>
      <div style="text-align:center;padding:12px"><a class="lnk" href="#/product?id=${pid}">← برگشت به محصول</a></div>`;
  } catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; }
};

/* ── LIBRARY — purchased products (0xBazaar #35 DNA) ── */
DGX.pages.library = async (view) => {
  if (!DGX.requireAuth('کتابخانه')) { location.hash = '#/home'; return; }
  view.innerHTML = DGX.skelCards(2);
  let a;
  try { a = await DGX.api('/api/app/activity'); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const b = a.bought || [];
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('book','ic-s')} ${b.length} محصول دیجیتال در مالکیت تو — هر وقت خواستی دانلود کن</p>
    ${b.length ? b.map(o => `
      <div class="notif-row own-row">
        <span class="rr-img">${DGX.icon('box')}</span>
        <div style="flex:1;min-width:0">
          <b>${DGX.esc(o.title)}</b>
          <span class="p-sub">${DGX.timeAgo(o.purchased_at || Date.now()/1000)} · <span class="pill p-ok" style="font-size:9.5px">مالک تو</span></span>
        </div>
        ${o.download_url ? `<a class="btn btn-primary" style="flex:none;padding:8px 12px" href="${DGX.esc(o.download_url)}">${DGX.icon('deposit','ic-s')} دانلود</a>` : ''}
      </div>`).join('') : `<div class="empty"><div class="big">${DGX.icon('book','big-ic')}</div>کتابخانه‌ات خالیه<br><br>
        <a class="btn btn-primary" href="#/explore">${DGX.icon('compass','ic-s')} گشتن در بازار</a></div>`}
    <div style="text-align:center;padding:12px"><a class="lnk" href="#/activity">تاریخچه‌ی کامل خرید/فروش ←</a></div>`;
};

/* ── ORDER — single order detail ── */
DGX.pages.order = async (view, params) => {
  const oid = +params.id; if (!oid) { location.hash = '#/activity'; return; }
  let a;
  try { a = await DGX.api('/api/app/activity'); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const o = (a.bought || []).find(x => +x.id === oid) || (a.sold || []).find(x => +x.id === oid);
  const isSold = o && !(a.bought || []).some(x => +x.id === oid);
  if (!o) { view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('doc','big-ic')}</div>سفارش پیدا نشد<br><br>
    <a class="btn btn-ghost" href="#/activity">تاریخچه‌ی فعالیت</a></div>`; return; }
  view.innerHTML = `
    <div class="col-head">${DGX.icon('doc')} <b>سفارش #${oid}</b><span>${isSold ? 'فروش تو' : 'خرید تو'}</span></div>
    <div class="post"><div class="post-body" style="padding:16px">
      <div class="sumrow"><span>محصول</span><b>${DGX.esc(o.title)}</b></div>
      ${isSold ? `<div class="sumrow"><span>خریدار</span><b>${DGX.esc(o.buyer || 'کاربر')}</b></div>` : ''}
      <div class="sumrow"><span>زمان</span><b>${DGX.timeAgo(o.purchased_at || Date.now()/1000)}</b></div>
      <div class="sumrow"><span>مبلغ</span><b class="num">${DGX.fmt(o.price_credits)} کردیت</b></div>
      <div class="sumrow total"><span>وضعیت</span><b style="font-size:13px">تکمیل‌شده ${DGX.icon('check','ic-s')}</b></div>
      ${(!isSold && o.download_url) ? `<a class="btn btn-primary" href="${DGX.esc(o.download_url)}">${DGX.icon('deposit','ic-s')} دانلود دوباره</a>` : ''}
      <a class="btn btn-ghost" href="#/library">${DGX.icon('book','ic-s')} کتابخانه‌ی من</a>
    </div></div>`;
};

/* ── PLANS — seller subscription tiers (0xBazaar #38 DNA) ── */
DGX.pages.plans = async (view) => {
  const P = [
    ['hunted', 'هانتر', 0, ['کمیسیون استاندارد', '۵ محصول فعال', 'فروش از طریق بات'], false],
    ['creator', 'سازنده', 0, ['بدون هزینه‌ی ماهانه', 'محصول نامحدود', 'فروشگاه عمومی', 'دراپ ویژه با تأیید ادمین'], true],
    ['studio', 'استودیو', 50, ['همه‌ی مزایای سازنده', 'اولویت بررسی محصول', 'نمایش ویژه در ترندها', 'پشتیبانی سریع'], false],
  ];
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('rocket','ic-s')} فروش در DropAgentX برای همه رایگان است — پلن‌ها فقط بونوس دیده‌شدن می‌دهند</p>
    <div class="plan-list">
      ${P.map(([k, t, price, feats, hot]) => `
        <div class="plan-card ${hot ? 'hot' : ''}">
          ${hot ? `<span class="plan-tag">فعلی تو</span>` : ''}
          <b>${t}</b>
          <span class="plan-price num">${price ? price + ' کردیت/ماه' : 'رایگان'}</span>
          <ul>${feats.map(f => `<li>${DGX.icon('check','ic-xs')} ${f}</li>`).join('')}</ul>
          <button class="btn ${hot ? 'btn-ghost' : 'btn-primary'}" onclick="DGX.openBot('/start')">
            ${DGX.icon('send','ic-s')} ${hot ? 'ادامه‌ی فروش' : 'ارتقا از بات'}</button>
        </div>`).join('')}
    </div>
    <p class="page-hint" style="margin-top:12px">کارمزد بازار در همه‌ی پلن‌ها یکسان و شفاف است — جزئیات در بات: /start → فروشگاه</p>`;
};
