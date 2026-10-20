/* DropAgentX v2.0 — FEED SUITE: reels / drops / trending / fresh / story-viewer
   (Instagram-style surfaces, wired to existing /api/app endpoints only) */
DGX.pages = DGX.pages || {};

/* compact product tile — shared by grid pages */
DGX.tile = p => `
  <a class="tile" href="#/product?id=${+p.id}">
    <div class="tile-img">${p.photo_url
      ? `<img src="${DGX.esc(p.photo_url)}" loading="lazy" onerror="this.remove()">`
      : DGX.icon('box', 'ic-xl ph-g')}</div>
    <b>${DGX.esc(p.title)}</b>
    <span class="num">${DGX.fmt(p.price_credits)} کردит · ≈${(+p.usd || 0).toFixed(2)}$</span>
  </a>`;

/* ── 1) REELS — vertical snap product theater ── */
DGX.pages.reels = async (view) => {
  view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('film','big-ic')}</div>در حال بارگذاری…</div>`;
  let d;
  try { d = await DGX.api('/api/app/feed?mode=trend&cursor=0'); }
  catch (e) { view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('live','big-ic')}</div>${e.msg || 'خطا'}<br><br>
    <a class="btn btn-ghost" href="#/home">برگشت به فید</a></div>`; return; }
  if (!d.items.length) { view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('film','big-ic')}</div>هنوز محصولی برای ریلز نیست<br><br>
    <a class="btn btn-primary" href="#/create">${DGX.icon('plus','ic-s')} اولین را بساز</a></div>`; return; }
  view.innerHTML = `<p class="page-hint">بالا/پایین بکش — لمس دکمه‌ی ❤ برای پسندیدن</p><div class="reels" id="reels"></div>`;
  const box = DGX.$('#reels');
  box.innerHTML = d.items.map(p => `
    <section class="reel post" data-pid="${+p.id}">
      <div class="reel-media">
        ${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}" loading="lazy">`
                      : `<div class="ph-media">${DGX.icon('box','ic-xl')}</div>`}
        <a class="reel-rail" href="#/product?id=${+p.id}" onclick="event.stopPropagation()">
          ${DGX.statBtn(p.liked ? 'i-heart-f' : 'i-heart', p.like_count, p.liked ? 'on like' : '', `data-eng="like"`)}
          ${DGX.statBtn('i-comment', p.comment_count, '', `onclick="location.hash='#/product?id=${+p.id}'"`)}
          ${DGX.statBtn('i-save', p.save_count, p.saved ? 'on save' : '', `data-eng="save"`)}
          ${DGX.statBtn('i-repost', 0, '', `data-share="1"`)}
        </a>
        <div class="reel-cap">
          <a class="post-title" href="#/product?id=${+p.id}">${DGX.esc(p.title)}</a>
          <div class="price-row" style="margin-top:6px">
            <span class="price num">${DGX.fmt(p.price_credits)} <small>کردیت</small></span>
            <button class="btn btn-primary" style="flex:none;padding:8px 14px" data-buy="${+p.id}"
              data-title="${DGX.esc(p.title)}" data-price="${+p.price_credits || 0}">${DGX.icon('cart','ic-s')} خرید</button>
          </div>
        </div>
      </div>
    </section>`).join('');
  DGX.wireFeed(box);
};

/* ── 2) DROPS — live drops hub (stories + featured) ── */
DGX.pages.drops = async (view) => {
  view.innerHTML = DGX.skelCards(2);
  let cats, tr;
  try {
    [cats, tr] = await Promise.all([
      DGX.api('/api/app/categories'), DGX.api('/api/app/trending?limit=6')]);
  } catch (e) { view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('live','big-ic')}</div>${e.msg || 'خطا'}</div>`; return; }
  const dayEnd = () => { const d = new Date(); d.setHours(23,59,59,0); return d; };
  const left = () => { const s = Math.max(0, (dayEnd() - Date.now()) / 1000);
    return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`; };
  view.innerHTML = `
    <div id="stories" class="stories">${DGX.storiesBox(cats.items)}</div>
    <div class="seg" style="margin:2px 0 12px"><button class="on">${DGX.icon('flame','ic-s')} دراپ‌های امروز</button></div>
    <div id="dropCards">${tr.items.map((p, i) => `
      <article class="post drop-card">
        <div class="post-head">
          <img class="avatar" src="/app/assets/logo.jpg" onerror="this.style.opacity=.25">
          <div><div class="p-name">${DGX.esc(p.creator_name || 'سازنده')} ${DGX.icon('check','ic-xs vf')}</div>
          <div class="p-sub">دراپ ویژه · ${DGX.timeAgo(p.created_at || Date.now()/1000)}</div></div>
          <span class="pill p-live" style="margin-inline-start:auto">${DGX.icon('live','ic-xs')} زنده</span>
        </div>
        <a class="post-media" href="#/product?id=${+p.id}">
          ${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}" loading="lazy">` : `<div class="ph-media">${DGX.icon('box','ic-xl')}</div>`}
          <span class="badge-drop">${DGX.icon('flame','ic-s')} DROP #${i + 1}</span>
        </a>
        <div class="post-body">
          <a class="post-title" href="#/product?id=${+p.id}" style="text-decoration:none;color:inherit">${DGX.esc(p.title)}</a>
          <div class="price-row"><span class="price num">${DGX.fmt(p.price_credits)} <small>کردیت</small></span>
            <span class="usd num">≈${(+p.usd || 0).toFixed(2)}$</span>
            <span class="pill" style="margin-inline-start:auto" id="cd_${i}">${DGX.icon('history','ic-xs')} ${left()}</span></div>
        </div>
        <div class="post-actions">
          <button class="btn btn-primary" data-buy="${+p.id}" data-title="${DGX.esc(p.title)}" data-price="${+p.price_credits || 0}">${DGX.icon('cart','ic-s')} خرید دراپ</button>
          <button class="btn btn-ghost" data-share="1">${DGX.icon('link','ic-s')} اشتراک</button>
        </div>
      </article>`).join('')}</div>
    <div style="text-align:center;padding:10px"><a class="lnk" href="#/trending">دیدن همه‌ی ترندها ←</a></div>`;
  DGX.wireFeed(DGX.$('#dropCards'));
  const tick = setInterval(() => { if (!document.getElementById('cd_0')) return clearInterval(tick);
    tr.items.forEach((_, i) => { const el = document.getElementById('cd_' + i);
      if (el) el.innerHTML = `${DGX.icon('history','ic-xs')} ${left()}`; }); }, 1000);
};

/* ── 3) TRENDING — ranked board with real time-window filters ── */
DGX.pages.trending = async (view) => {
  view.innerHTML = DGX.skelCards(2);
  let d;
  try { d = await DGX.api('/api/app/trending?limit=10'); }
  catch (e) { view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('chart','big-ic')}</div>${e.msg || 'خطا'}</div>`; return; }
  const WIN = { d1: 86400, d7: 604800, d30: 2592000 };
  const win = WIN[params_win()] || 0;
  function params_win() { return (location.hash.split('win=')[1] || '').slice(0, 3); }
  const now = Date.now() / 1000;
  const rows = d.items.filter(p => !win || (now - (p.created_at || 0)) <= win);
  const hero = rows[0] || d.items[0];
  view.innerHTML = `
    <div class="chips">
      ${[['all', 'همه‌ی زمان‌ها'], ['d1', '۲۴ ساعت'], ['d7', '۷ روز'], ['d30', '۳۰ روز']].map(([k, t]) =>
        `<button class="chip ${(!win && k === 'all') || (win === WIN[k] && k !== 'all') ? 'on' : ''}"
          onclick="location.hash='#/trending?win=${k}'">${t}</button>`).join('')}
    </div>
    ${hero ? `<article class="post" data-pid="${+hero.id}">
      <div class="post-head"><span class="rank-badge big">1</span>
        <div><div class="p-name">ترند شماره‌ی یک امروز ${DGX.icon('flame','ic-xs')}</div>
        <div class="p-sub">${DGX.kfmt(hero.sales_count)} فروش · ${DGX.kfmt(hero.like_count)} پسند</div></div></div>
      <a class="post-media" href="#/product?id=${+hero.id}">
        ${hero.photo_url ? `<img src="${DGX.esc(hero.photo_url)}">` : `<div class="ph-media">${DGX.icon('box','ic-xl')}</div>`}</a>
      <div class="post-body"><a class="post-title" href="#/product?id=${+hero.id}" style="text-decoration:none;color:inherit">${DGX.esc(hero.title)}</a>
        <div class="price-row"><span class="price num">${DGX.fmt(hero.price_credits)} <small>کردیت</small></span></div></div>
      <div class="post-actions">
        <button class="btn btn-primary" data-buy="${+hero.id}" data-title="${DGX.esc(hero.title)}" data-price="${+hero.price_credits || 0}">${DGX.icon('cart','ic-s')} خرید فوری</button>
        <a class="btn btn-ghost" href="#/product?id=${+hero.id}">جزئیات ↗</a></div>
    </article>` : ''}
    <div class="rank-list" id="rk">${rows.slice(1).map((p, i) => `
      <a class="rank-row" href="#/product?id=${+p.id}">
        <span class="rank-badge">${i + 2}</span>
        <div class="rr-img">${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}" loading="lazy">` : DGX.icon('box')}</div>
        <div style="flex:1;min-width:0"><b>${DGX.esc(p.title)}</b>
          <span class="p-sub">${DGX.esc(p.creator_name || 'سازنده')} · ${DGX.kfmt(p.sales_count)} فروش</span></div>
        <div style="text-align:end"><b class="num" style="color:var(--em)">${DGX.fmt(p.price_credits)}</b>
          <span class="p-sub num">≈${(+p.usd || 0).toFixed(2)}$</span></div>
      </a>`).join('') || '<div class="empty" style="padding:20px">در این بازه چیزی نیست</div>'}</div>
    <div style="text-align:center;padding:12px"><a class="lnk" href="#/drops">دراپ‌های زنده ←</a> · <a class="lnk" href="#/reels">ریلز ←</a></div>`;
  if (hero) DGX.wireFeed(view);
};

/* ── 4) FRESH — newest-first infinite feed ── */
DGX.pages.fresh = async (view) => {
  let cursor = 0, ended = false, busy = false;
  view.innerHTML = `<p class="page-hint">${DGX.icon('deposit','ic-s')} تازه‌ترین محصولات — بدون رتبه‌بندی، دقیقاً به ترتیب انتشار</p>
    <div id="ffeed"></div><div id="more" style="text-align:center;color:var(--dim2);padding:14px"></div>`;
  const feed = DGX.$('#ffeed'), more = DGX.$('#more');
  async function load() {
    if (busy || ended) return; busy = true; more.textContent = '…';
    try {
      const d = await DGX.api(`/api/app/feed?mode=foryou&cursor=${cursor}`);
      ended = d.next === null;
      [...d.items].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .forEach(p => feed.insertAdjacentHTML('beforeend', DGX.postCard(p)));
      DGX.wireFeed(feed); cursor = d.next ?? cursor;
      more.textContent = ended ? 'همه‌ی تازه‌ها را دیدی' : '';
    } catch (e) { more.textContent = ''; DGX.toast(e.msg || 'خطا', true); }
    busy = false;
  }
  await load();
  DGX.ptr(view, load);
  window.onscroll = () => { if (innerHeight + scrollY > document.body.scrollHeight - 500) load(); };
};

/* ── 5) STORY VIEWER — fullscreen IG stories (auto-advance + tap zones) ── */
DGX.pages.story = async (view, params) => {
  let d;
  try { d = await DGX.api('/api/app/trending?limit=10'); }
  catch (e) { view.innerHTML = `<div class="empty"><div class="big">${DGX.icon('live','big-ic')}</div>${e.msg || 'خطا'}</div>`; return; }
  const items = d.items; if (!items.length) { view.innerHTML = '<div class="empty">استوری‌ای نیست</div>'; return; }
  let i = Math.max(0, items.findIndex(p => +p.id === +params.id));
  view.innerHTML = `
    <div class="story-v" id="sv">
      <div class="sv-bars" id="svBars"></div>
      <div class="sv-head">
        <img class="avatar" style="width:30px;height:30px" src="/app/assets/logo.jpg">
        <b id="svName"></b><span class="p-sub" id="svTime"></span>
        <button class="icon-btn" id="svClose" style="width:32px;height:32px;margin-inline-start:auto">✕</button>
      </div>
      <div class="sv-body" id="svBody"></div>
      <div class="sv-foot" id="svFoot"></div>
    </div>`;
  const sv = DGX.$('#sv'); let timer = null;
  function draw() {
    const p = items[i];
    DGX.$('#svBars').innerHTML = items.map((_, j) =>
      `<i class="${j < i ? 'done' : ''} ${j === i ? 'act' : ''}"></i>`).join('');
    DGX.$('#svName').textContent = p.creator_name || 'DropAgentX';
    DGX.$('#svTime').textContent = ' · ' + DGX.timeAgo(p.created_at || Date.now() / 1000);
    DGX.$('#svBody').innerHTML = `
      ${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}">` : `<div class="ph-media" style="height:100%">${DGX.icon('box','ic-xl')}</div>`}
      <span class="sv-prev"></span><span class="sv-next"></span>`;
    DGX.$('#svFoot').innerHTML = `
      <div class="sv-card">
        <b>${DGX.esc(p.title)}</b>
        <div class="price-row" style="margin-top:6px">
          <span class="price num">${DGX.fmt(p.price_credits)} <small>کردیت</small></span>
          <span style="margin-inline-start:auto;display:flex;gap:8px">
            <button class="btn btn-primary" style="padding:8px 14px" data-buy="${+p.id}"
              data-title="${DGX.esc(p.title)}" data-price="${+p.price_credits || 0}">${DGX.icon('cart','ic-s')} خرید</button>
            <a class="btn btn-ghost" style="padding:8px 12px" href="#/product?id=${+p.id}">↗</a></span>
        </div>
      </div>`;
    DGX.wireFeed(DGX.$('#svFoot'));
    DGX.$('.sv-prev').onclick = () => { go(i - 1); };
    DGX.$('.sv-next').onclick = () => { go(i + 1); };
    clearInterval(timer);
    timer = setInterval(() => go(i + 1), 6000);
    const bar = DGX.$('#svBars .act'); if (bar) bar.style.animation = 'none';
    requestAnimationFrame(() => { if (bar) { bar.style.animation = ''; } });
  }
  function go(n) {
    if (n < 0) n = 0; if (n >= items.length) { location.hash = '#/home'; return; }
    i = n; draw();
  }
  DGX.$('#svClose').onclick = () => location.hash = '#/home';
  draw();
};
