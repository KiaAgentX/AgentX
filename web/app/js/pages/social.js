/* DropAgentX v2.0 — SOCIAL SUITE: notifications / likes / saved / people /
   follows / profile-edit / share-center  (Instagram-like social surfaces) */
DGX.pages = DGX.pages || {};

/* ── NOTIFICATIONS — earnings + sales timeline (real data) ── */
DGX.pages.notifications = async (view) => {
  if (!DGX.requireAuth('اعلان‌ها')) { location.hash = '#/home'; return; }
  view.innerHTML = DGX.skelCards(2);
  let w, a;
  try { [w, a] = await Promise.all([DGX.api('/api/app/wallet'), DGX.api('/api/app/activity')]); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const ev = [];
  (w.txs || []).slice(0, 12).forEach(t => ev.push({
    icon: { deposit: 'deposit', withdraw: 'withdraw', purchase: 'cart', sale: 'wallet',
            task_completion: 'check', referral_bonus: 'gift', admin_grant: 'shield',
            welcome: 'flame' }[t.tx_type] || 'wallet',
    title: ({ sale: 'فروش جدید!', deposit: 'واریز انجام شد', purchase: 'خرید انجام شد',
             withdraw: 'برداشت در صف', task_completion: 'تکمیل تسک',
             referral_bonus: 'پاداش ریفرال', admin_grant: 'تغییری از ادمین',
             welcome: 'خوش آمدی!' })[t.tx_type] || t.tx_type,
    desc: t.description || '', t: t.created_at, amount: t.amount,
    hash: `#/transactions` }));
  (a.sold || []).slice(0, 8).forEach(o => ev.push({
    icon: 'shop', title: `${o.buyer || 'یک کاربر'} «${o.title}» را خرید`,
    desc: 'وارد سبد فروش تو شد', t: o.purchased_at, amount: o.price_credits, hash: `#/order?id=${+o.id}` }));
  ev.sort((x, y) => (y.t || 0) - (x.t || 0));
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('bell','ic-s')} ${ev.length} رویداد زنده — از کیف پول و فروش‌های تو</p>
    ${ev.length ? ev.slice(0, 30).map(n => `
      <a class="notif-row" href="${n.hash || '#/wallet'}">
        <span class="nr-ic">${DGX.icon(n.icon)}</span>
        <div style="flex:1;min-width:0"><b>${DGX.esc(n.title)}</b>
          ${n.desc ? `<span class="p-sub">${DGX.esc(n.desc)}</span>` : ''}</div>
        <div style="text-align:end">
          ${n.amount != null ? `<b class="num" style="color:${(+n.amount || 0) >= 0 && n.icon === 'wallet' || n.icon === 'deposit' || n.icon === 'gift' ? 'var(--em)' : 'var(--txt)'}">${DGX.fmt(n.amount)}</b>` : ''}
          <span class="p-sub">${DGX.timeAgo(n.t || Date.now()/1000)}</span></div>
      </a>`).join('') : `<div class="empty"><div class="big">${DGX.icon('bell','big-ic')}</div>هنوز خبری نیست<br><br>
        <a class="btn btn-primary" href="#/create">${DGX.icon('plus','ic-s')} محصول بساز تا فروش بیاید</a></div>`}`;
};

/* ── LIKES / SAVED — local collections (recorded on this device) ── */
const _localGrid = (key, icon, title, hint, emptyCta) => async (view) => {
  const l = DGX.localList(key);
  view.innerHTML = `
    <p class="page-hint">${DGX.icon(icon,'ic-s')} ${hint}</p>
    ${l.length ? `<div class="mosaic">${l.map(x => `
      <a class="tile" href="#/product?id=${+x.id}">
        <div class="tile-img">${x.photo ? `<img src="${DGX.esc(x.photo)}" loading="lazy">` : DGX.icon('box','ic-xl ph-g')}</div>
        <b>${DGX.esc(x.title || 'محصول')}</b>
        <span class="num">${DGX.esc(x.price || '')}</span>
      </a>`).join('')}</div>
      <div style="text-align:center;padding:14px">
        <button class="lnk" id="clearL">خالی کردن فهرست</button></div>`
      : `<div class="empty"><div class="big">${DGX.icon(icon,'big-ic')}</div>${title}<br><br>
         <a class="btn btn-primary" href="${emptyCta[1]}">${DGX.icon(emptyCta[2] || 'compass','ic-s')} ${emptyCta[0]}</a></div>`}`;
  const c = DGX.$('#clearL');
  if (c) c.onclick = () => { localStorage.removeItem(key); DGX.toast('خالی شد'); view.innerHTML = '<div class="empty">خالی شد — دوباره پرش کن 🌱</div>'; };
};
DGX.pages.likes = _localGrid('dgx_liked', 'heart', 'هنوز چیزی را نپسندیدی', 'پسندهای تو روی این دستگاه — با دابل‌تپ روی عکس‌ها هم می‌تونی پسند کنی', ['گشتن در فید', '#/home', 'flame']);
DGX.pages.saved = _localGrid('dgx_saved', 'save', 'هنوز چیزی ذخیره نکردی', 'ذخیره‌شده‌ها روی این دستگاه — از دکمه‌ی نشانک روی هر کارت', ['کشف بازار', '#/explore', 'compass']);

/* ── PEOPLE — top creators + user search ── */
DGX.pages.people = async (view) => {
  view.innerHTML = DGX.skelCards(2);
  let lb, sr = null;
  try { lb = await DGX.api('/api/pub/leaderboard'); } catch (_) { lb = { items: [] }; }
  view.innerHTML = `
    <div class="search-bar2" style="margin-bottom:12px">
      ${DGX.icon('search','ic-s')}<input id="pq" placeholder="جستجوی کاربر و فروشگاه…">
    </div>
    <p class="page-hint">${DGX.icon('trophy','ic-s')} جدول قهرمانان — بیشترین فروش در کل بازار</p>
    <div id="lb">${lb.items.map((u, i) => `
      <a class="notif-row" href="#/seller?uid=${+u.user_id}">
        <span class="rank-badge ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <img class="avatar" style="width:36px;height:36px" src="/app/assets/logo.jpg">
        <div style="flex:1;min-width:0"><b>${DGX.esc(u.name)}</b>
          <span class="p-sub">${DGX.kfmt(u.sold)} فروش · ${DGX.kfmt(u.credits)} کردیت</span></div>
        <span class="cc-go">${DGX.icon('chevron-l','ic-s')}</span>
      </a>`).join('') || '<div class="empty" style="padding:16px">هنوز جدولی نیست</div>'}</div>
    <div id="pRes"></div>`;
  const q = DGX.$('#pq'), res = DGX.$('#pRes');
  let tm = null;
  q.oninput = () => {
    clearTimeout(tm);
    tm = setTimeout(async () => {
      if (q.value.trim().length < 2) { res.innerHTML = ''; return; }
      try {
        const d = await DGX.api(`/api/app/search?q=${encodeURIComponent(q.value.trim())}`);
        res.innerHTML = (d.users || []).length ? `<p class="page-hint" style="margin-top:12px">کاربران</p>` +
          d.users.map(u => `
            <a class="notif-row" href="#/seller?uid=${+u.user_id}">
              <img class="avatar" style="width:36px;height:36px" src="/app/assets/logo.jpg">
              <div style="flex:1"><b>${DGX.esc(u.first_name || '')}</b>
                <span class="p-sub">@${DGX.esc(u.username || '')}</span></div>
              <span class="cc-go">${DGX.icon('chevron-l','ic-s')}</span></a>`).join('') : '';
      } catch (_) {}
    }, 350);
  };
};

/* ── FOLLOWS — stores you follow (server truth) + suggestions ── */
DGX.pages.follows = async (view) => {
  if (!DGX.requireAuth('فالوها')) { location.hash = '#/home'; return; }
  view.innerHTML = DGX.skelCards(2);
  let ids, lb;
  try { [ids, lb] = await Promise.all([DGX.api('/api/app/following-ids'), DGX.api('/api/pub/leaderboard')]); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const list = ids.items || ids.ids || ids || [];
  const arr = Array.isArray(list) ? list : [];
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('users','ic-s')} ${arr.length} فروشگاه دنبال می‌کنی — فید «فالوینگ‌ها» از همین‌ها ساخته می‌شود</p>
    <div id="fl">${arr.length ? '' : `<div class="empty"><div class="big">${DGX.icon('users','big-ic')}</div>هنوز کسی را دنبال نکرده‌ای<br><br>
      <a class="btn btn-primary" href="#/people">${DGX.icon('trophy','ic-s')} خالق‌های برتر</a></div>`}</div>
    <div id="flCards"></div>
    ${arr.length ? '' : `<p class="page-hint" style="margin-top:8px">پیشنهاد ما</p>
      <div>${(lb.items || []).slice(0, 5).map(u => `
        <a class="notif-row" href="#/seller?uid=${+u.user_id}">
          <span class="nr-ic">${DGX.icon('user')}</span>
          <div style="flex:1"><b>${DGX.esc(u.name)}</b><span class="p-sub">${DGX.kfmt(u.sold)} فروش</span></div>
          <span class="cc-go">${DGX.icon('chevron-l','ic-s')}</span></a>`).join('')}</div>`}`;
  const box = DGX.$('#flCards');
  for (const uid of arr.slice(0, 20)) {
    try {
      const s = await DGX.api(`/api/app/store/${+uid}`);
      box.insertAdjacentHTML('beforeend', `
        <a class="notif-row" href="#/seller?uid=${+uid}">
          ${s.avatar_url ? `<img class="avatar" style="width:38px;height:38px" src="${DGX.esc(s.avatar_url)}">` : `<span class="nr-ic">${DGX.icon('user')}</span>`}
          <div style="flex:1;min-width:0"><b>${DGX.esc(s.name)}</b>
            <span class="p-sub">${DGX.kfmt(s.products.length)} محصول · ${DGX.kfmt(s.total_sales)} فروش</span></div>
          <span class="cc-go">${DGX.icon('chevron-l','ic-s')}</span></a>`);
    } catch (_) {}
  }
};

/* ── PROFILE-EDIT — avatar/cover via real API + local prefs ── */
DGX.pages['profile-edit'] = async (view) => {
  if (!DGX.requireAuth('ویرایش')) { location.hash = '#/profile'; return; }
  const u = DGX.user || {};
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('image','ic-s')} عکس‌ها مستقیم روی سرور ذخیره می‌شوند — نام و بایو از بات</p>
    <div class="post" style="padding:16px">
      <div class="field"><label>آواتار</label>
        <div class="post-actions" style="padding:0">
          <button class="btn btn-ghost" onclick="DGX.upPhoto('avatar')">${DGX.icon('image','ic-s')} انتخاب آواتار</button></div></div>
      <div class="field"><label>کاور پروفایل</label>
        <div class="post-actions" style="padding:0">
          <button class="btn btn-ghost" onclick="DGX.upPhoto('cover')">${DGX.icon('palette','ic-s')} انتخاب کاور</button></div></div>
      <div class="field"><label>نام نمایشی (از بات)</label>
        <input value="${DGX.esc(u.name || '')}" disabled style="opacity:.6">
      </div>
      <a class="btn btn-primary" href="#" onclick="DGX.openBot('/profile');return false">${DGX.icon('send','ic-s')} تغییر نام از بات</a>
    </div>
    <div class="post" style="padding:16px">
      <h3 style="margin-bottom:8px">${DGX.icon('settings','ic-s')} ترجیحات این دستگاه</h3>
      <div class="set-row" id="setHaptic"><span class="nr-ic">${DGX.icon('live')}</span>
        <div style="flex:1"><b>لرزش هنگام لمس</b><span class="p-sub">haptic feedback</span></div>
        <b id="hv" style="color:var(--em)"></b></div>
      <div class="set-row" onclick="DGX.toast('تم NEON تنها تم رسمی v2.0 است')">
        <span class="nr-ic">${DGX.icon('palette')}</span>
        <div style="flex:1"><b>تم</b><span class="p-sub">NEON — پیش‌فرض برند</span></div>
        <b style="color:var(--em)">فعال</b></div>
    </div>
    <div style="text-align:center;padding:10px"><a class="lnk" href="#/profile">← برگشت به پروفایل</a></div>`;
  const h = DGX.$('#setHaptic'), hv = DGX.$('#hv');
  const sync = () => hv.textContent = localStorage.getItem('dgx_haptic') === '0' ? 'خاموش' : 'روشن';
  sync();
  h.onclick = () => {
    const off = localStorage.getItem('dgx_haptic') !== '0';
    localStorage.setItem('dgx_haptic', off ? '0' : '1');
    if (!off) DGX.haptic('medium');
    sync();
  };
};

/* ── SHARE CENTER — growth hub (referral + share) ── */
DGX.pages.share = async (view) => {
  const u = DGX.user || {};
  const link = `${location.origin}/#/home`;
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('link','ic-s')} هر دوست که با لینک تو بیاد و خرید کنه، هر دوتون پاداش می‌گیرید — حلقه‌ی رشد DropAgentX</p>
    <div class="post" style="padding:16px;text-align:center">
      <div class="burst-wrap" style="width:64px;height:64px"><span class="success-ring">${DGX.icon('gift')}</span></div>
      <b style="font-size:16px">دعوت = کردیت رایگان</b>
      <p class="p-sub" style="margin:6px 0 12px">لینک را در هر چت تلگرامی بفرست — بقیه‌اش با بات</p>
      <button class="btn btn-primary" id="shMain">${DGX.icon('send','ic-s')} اشتراک در تلگرام</button>
      <button class="btn btn-ghost" id="shCopy">${DGX.icon('link','ic-s')} کپی لینک</button>
    </div>
    <div class="col-grid">
      <div class="col-card"><span class="cc-ic">${DGX.icon('send')}</span><b>اشتراک محصول</b><span>از دکمه‌ی اشتراک روی هر کارت</span></div>
      <div class="col-card" onclick="DGX.openBot('/referral')"><span class="cc-ic">${DGX.icon('gift')}</span><b>کد ریفرال من</b><span>مشاهده‌ی پاداش‌ها در بات</span></div>
    </div>`;
  DGX.$('#shMain').onclick = () => DGX.shareUrl(link, 'بیا تو DropAgentX — بازار محصولات دیجیتال داخل تلگرام 🛍');
  DGX.$('#shCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); DGX.toast('کپی شد ✅'); }
    catch (_) { DGX.toast(link, true); }
  };
};
