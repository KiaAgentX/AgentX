/* DropAgentX v2.0 — CREATOR SUITE: create-drop / drafts / dashboard / analytics /
   products-manage / payouts  (seller tools on real store+activity+wallet APIs) */
DGX.pages = DGX.pages || {};

/* ── CREATE-DROP — drop composer w/ live preview (0xBazaar #36 DNA) ── */
DGX.pages['create-drop'] = async (view) => {
  if (!DGX.requireAuth('ساخت دراپ')) { location.hash = '#/home'; return; }
  let s = null;
  try { s = await DGX.api(`/api/app/store/${DGX.user.id}`); } catch (_) {}
  const prods = (s && s.products) || [];
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('flame','ic-s')} دراپ = موج فروش محدود. فرم را پر کن، بات منتشرش می‌کند و در صفحه‌ی «دراپ‌ها» می‌نشیند.</p>
    <div class="post" style="padding:16px">
      <div class="field"><label>محصول دراپ</label>
        <select id="dProd">${prods.length ? prods.map(p => `<option value="${+p.id}">${DGX.esc(p.title)}</option>`).join('')
          : '<option value="">اول یک محصول بساز</option>'}</select></div>
      <div class="field"><label>عنوان دراپ</label>
        <input id="dTitle" maxlength="80" placeholder="مثلاً: دراپ طلایی جمعه‌شب"></div>
      <div class="field"><label>زمان پایان</label>
        <select id="dEnd"><option value="امشب">امشب (تا ۲۴)</option><option value="۲۴ ساعت">۲۴ ساعت</option><option value="۴۸ ساعت">۴۸ ساعت</option><option value="یک هفته">یک هفته</option></select></div>
      <div class="field"><label>متن اعلان</label>
        <textarea id="dMsg" rows="3" maxlength="300" placeholder="یک جمله‌ی هیجانی برای فالوورها…"></textarea></div>
      <button class="btn btn-primary" id="dGo" ${prods.length ? '' : 'disabled style="opacity:.5"'}>${DGX.icon('send','ic-s')} ثبت دراپ از طریق بات</button>
      <a class="btn btn-ghost" href="#/drafts">${DGX.icon('doc','ic-s')} پیش‌نویس‌ها</a>
    </div>
    <h3 style="margin:16px 0 8px">${DGX.icon('eye','ic-s')} پیش‌نمایش زنده</h3>
    <div class="post" id="dPrev"></div>`;
  const t = DGX.$('#dTitle'), m = DGX.$('#dMsg'), prev = DGX.$('#dPrev');
  const draw = () => {
    const p = prods.find(x => +x.id === +DGX.$('#dProd').value) || prods[0];
    prev.innerHTML = `
      <div class="post-head"><span class="nr-ic">${DGX.icon('flame')}</span>
        <div><div class="p-name">${DGX.esc(t.value || 'دراپ جدید تو')}</div>
        <div class="p-sub">پایان: ${DGX.$('#dEnd').value}</div></div>
        <span class="pill p-live" style="margin-inline-start:auto">زنده</span></div>
      ${p ? `<div class="ph-media" style="height:110px">${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}" style="width:100%;height:100%;object-fit:cover">` : DGX.icon('box','ic-xl')}</div>` : ''}
      <div class="post-body"><div class="post-desc">${DGX.esc(m.value || 'متن اعلان اینجا نمایش داده می‌شود…')}</div></div>`;
  };
  [t, m].forEach(el => el.oninput = draw);
  DGX.$('#dProd').onchange = draw; draw();
  DGX.$('#dGo').onclick = () => {
    const p = prods.find(x => +x.id === +DGX.$('#dProd').value);
    const txt = `دراپ «${t.value || 'بدون عنوان'}» — محصول: ${p ? p.title : '؟'} — پایان: ${DGX.$('#dEnd').value}\n${m.value}`;
    const d = DGX.localList('dgx_drafts');
    d.unshift({ k: 'drop', txt, t: Date.now() });
    localStorage.setItem('dgx_drafts', JSON.stringify(d.slice(0, 30)));
    DGX.openBot('/drop ' + txt.slice(0, 120));
    DGX.toast('پیش‌نویس ذخیره شد + بات باز شد');
  };
};

/* ── DRAFTS — local composer drafts ── */
DGX.pages.drafts = async (view) => {
  const l = DGX.localList('dgx_drafts');
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('doc','ic-s')} ${l.length} پیش‌نویس روی این دستگاه</p>
    ${l.length ? l.map((d, i) => `
      <div class="notif-row">
        <span class="nr-ic">${DGX.icon(d.k === 'drop' ? 'flame' : 'doc')}</span>
        <div style="flex:1;min-width:0"><b>${d.k === 'drop' ? 'دراپ' : 'یادداشت'}</b>
          <span class="p-sub" style="display:block;white-space:pre-line">${DGX.esc((d.txt || '').slice(0, 140))}</span></div>
        <button class="lnk" data-i="${i}">حذف</button>
      </div>`).join('') : `<div class="empty"><div class="big">${DGX.icon('doc','big-ic')}</div>پیش‌نویسی نیست<br><br>
        <a class="btn btn-primary" href="#/create-drop">${DGX.icon('flame','ic-s')} ساخت دراپ</a></div>`}`;
  view.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const l2 = DGX.localList('dgx_drafts'); l2.splice(+b.dataset.i, 1);
    localStorage.setItem('dgx_drafts', JSON.stringify(l2));
    DGX.toast('حذف شد'); DGX.pages.drafts(view, {});
  });
};

/* ── DASHBOARD — seller home (0xBazaar #08 DNA) ── */
DGX.pages.dashboard = async (view) => {
  if (!DGX.requireAuth('داشبورد')) { location.hash = '#/home'; return; }
  view.innerHTML = DGX.skelCards(2);
  let a, w, s;
  try { [a, w, s] = await Promise.all([
    DGX.api('/api/app/activity'), DGX.api('/api/app/wallet'),
    DGX.api(`/api/app/store/${DGX.user.id}`).catch(() => null)]); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const sold = a.sold || [];
  const revenue = sold.reduce((x, o) => x + (o.price_credits || 0), 0);
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('shop','ic-s')} ${DGX.esc((DGX.user || {}).name || 'رفیق')} — فروشگاهت در حال رشد است</p>
    <div class="stat-grid">
      <div class="stat-card"><span>${DGX.icon('cart','ic-s')} فروش</span><b class="num">${sold.length}</b></div>
      <div class="stat-card"><span>${DGX.icon('wallet','ic-s')} درآمد کل</span><b class="num">${DGX.fmt(w.earned || 0)}</b></div>
      <div class="stat-card"><span>${DGX.icon('box','ic-s')} محصول</span><b class="num">${s ? s.products.length : 0}</b></div>
      <div class="stat-card"><span>${DGX.icon('users','ic-s')} فالوور</span><b class="num">${DGX.kfmt(s ? s.followers : 0)}</b></div>
    </div>
    <div class="post" style="padding:14px">
      <h3 style="margin-bottom:8px">${DGX.icon('chart','ic-s')} درآمد ۷ روز اخیر</h3>
      <div class="bars">${DGX.weekBars(sold)}</div>
    </div>
    <div class="col-grid">
      <a class="col-card" href="#/create"><span class="cc-ic">${DGX.icon('plus')}</span><b>محصول جدید</b></a>
      <a class="col-card" href="#/create-drop"><span class="cc-ic">${DGX.icon('flame')}</span><b>دراپ جدید</b></a>
      <a class="col-card" href="#/analytics"><span class="cc-ic">${DGX.icon('chart')}</span><b>تحلیل</b></a>
      <a class="col-card" href="#/payouts"><span class="cc-ic">${DGX.icon('withdraw')}</span><b>برداشت</b></a>
    </div>
    <h3 style="margin:16px 0 8px">${DGX.icon('history','ic-s')} آخرین سفارش‌ها</h3>
    ${sold.slice(0, 3).map(o => `
      <a class="notif-row" href="#/order?id=${+o.id}">
        <span class="rr-img">${DGX.icon('box')}</span>
        <div style="flex:1;min-width:0"><b>${DGX.esc(o.title)}</b>
          <span class="p-sub">${DGX.esc(o.buyer || '')} · ${DGX.timeAgo(o.purchased_at || 0)}</span></div>
        <b class="num" style="color:var(--em)">+${DGX.fmt(o.price_credits)}</b></a>`).join('') ||
      `<div class="empty" style="padding:16px">هنوز فروشی نیست — اولین محصول را بساز<br><br>
        <a class="btn btn-primary" href="#/create">${DGX.icon('plus','ic-s')} شروع فروش</a></div>`}`;
};

/* ── ANALYTICS — sales analysis (0xBazaar #14 DNA) ── */
DGX.pages.analytics = async (view) => {
  if (!DGX.requireAuth('تحلیل')) { location.hash = '#/home'; return; }
  let a, w;
  try { [a, w] = await Promise.all([DGX.api('/api/app/activity'), DGX.api('/api/app/wallet')]); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const sold = a.sold || [], bought = a.bought || [];
  const rev = sold.reduce((x, o) => x + (o.price_credits || 0), 0);
  const spend = bought.reduce((x, o) => x + (o.price_credits || 0), 0);
  const aov = sold.length ? Math.round(rev / sold.length) : 0;
  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><span>درآمد</span><b class="num" style="color:var(--em)">${DGX.fmt(w.earned || rev)}</b></div>
      <div class="stat-card"><span>سفارش‌ها</span><b class="num">${sold.length}</b></div>
      <div class="stat-card"><span>میانگین سفارش</span><b class="num">${DGX.fmt(aov)}</b></div>
      <div class="stat-card"><span>مصرف تو</span><b class="num">${DGX.fmt(w.spent || spend)}</b></div>
    </div>
    <div class="post" style="padding:14px">
      <h3 style="margin-bottom:8px">${DGX.icon('chart','ic-s')} فروش ۷ روز اخیر</h3>
      <div class="bars">${DGX.weekBars(sold)}</div>
    </div>
    <div class="post" style="padding:14px">
      <h3 style="margin-bottom:10px">${DGX.icon('trophy','ic-s')} محصولات پرفروش تو</h3>
      ${( sold.reduce((acc, o) => { const f = acc.find(x => x.t === o.title);
          if (f) f.n++; else acc.push({ t: o.title, n: 1, c: o.price_credits || 0 }); return acc; }, [])
        .sort((x, y) => y.n - x.n).slice(0, 6).map(x => `
        <div class="bar-row"><span>${DGX.esc(x.t)}</span>
          <i style="width:${Math.min(100, x.n * 25)}%"></i><b class="num">${x.n}</b></div>`).join('')) ||
        '<div class="empty" style="padding:12px">داده‌ای نیست — با اولین فروش پر می‌شود</div>'}
    </div>
    <div style="text-align:center;padding:10px"><a class="lnk" href="#/dashboard">← داشبورد فروشنده</a></div>`;
};

/* ── PRODUCTS-MANAGE — my catalog (0xBazaar #13 DNA) ── */
DGX.pages['products-manage'] = async (view) => {
  if (!DGX.requireAuth('مدیریت')) { location.hash = '#/home'; return; }
  let s;
  try { s = await DGX.api(`/api/app/store/${DGX.user.id}`); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const ps = s.products || [];
  view.innerHTML = `
    <div class="chips">
      <button class="chip on">${DGX.icon('box','ic-xs')} ${ps.length} محصول</button>
      <button class="chip">${DGX.kfmt(s.total_sales)} فروش کل</button>
    </div>
    ${ps.length ? ps.map(p => `
      <div class="notif-row">
        <div class="rr-img">${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}">` : DGX.icon('box')}</div>
        <div style="flex:1;min-width:0"><b>${DGX.esc(p.title)}</b>
          <span class="p-sub">${DGX.kfmt(p.sales_count)} فروش · ${DGX.kfmt(p.like_count)} پسند</span></div>
        <b class="num" style="color:var(--em)">${DGX.fmt(p.price_credits)}</b>
      </div>`).join('') : `<div class="empty"><div class="big">${DGX.icon('box','big-ic')}</div>قفسه‌ات خالیه<br><br>
        <a class="btn btn-primary" href="#/create">${DGX.icon('plus','ic-s')} اولین محصول</a></div>`}
    <a class="btn btn-ghost" style="margin-top:10px" href="#/create">${DGX.icon('plus','ic-s')} محصول جدید</a>`;
};

/* ── PAYOUTS — settlement center ── */
DGX.pages.payouts = async (view) => {
  if (!DGX.requireAuth('تسویه')) { location.hash = '#/home'; return; }
  let w;
  try { w = await DGX.api('/api/app/wallet'); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  view.innerHTML = `
    <div class="post" style="padding:16px">
      <div class="sumrow"><span>موجودی قابل برداشت</span><b class="num" style="color:var(--em)">${DGX.fmt(w.credits)} کردیت</b></div>
      <div class="sumrow"><span>ارزش تقریبی</span><b class="num">≈${(w.credits / (w.per_usdt || 100)).toFixed(2)}$</b></div>
      <div class="sumrow total"><span>کل درآمد تا امروز</span><b class="num">${DGX.fmt(w.earned || 0)}</b></div>
      <button class="btn btn-primary" onclick="DGX.openBot('/withdraw')">${DGX.icon('withdraw','ic-s')} درخواست برداشت از بات</button>
      <a class="btn btn-ghost" href="#/transactions">${DGX.icon('history','ic-s')} تاریخچه‌ی تراکنش‌ها</a>
    </div>
    <div class="post" style="padding:16px">
      <h3 style="margin-bottom:8px">${DGX.icon('shield','ic-s')} قوانین تسویه</h3>
      <div class="sumrow"><span>حداقل برداشت</span><b>۱۰۰ کردیت</b></div>
      <div class="sumrow"><span>زمان پردازش</span><b>تا ۲۴ ساعت</b></div>
      <div class="sumrow"><span>کارمزد برداشت</span><b class="free">۰ — رایگان</b></div>
    </div>`;
};
