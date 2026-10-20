/* DropAgentX — UI helpers */
DGX.$ = s => document.querySelector(s);
DGX.esc = s => (s ?? '').toString().replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
DGX.fmt = n => Number(n || 0).toLocaleString('en-US');

DGX.usd = credits => {
  const per = DGX.perUsdt || 1000;
  const v = (+credits || 0) / per;
  return '≈' + (v >= 100 ? v.toFixed(0) : v.toFixed(2)) + '$';
};

DGX.kfmt = n => {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

DGX.timeAgo = ts => {
  const s = Math.max(1, (Date.now() / 1000) - (+ts || 0));
  if (s < 60) return 'همین حالا';
  if (s < 3600) return Math.floor(s / 60) + ' دقیقه پیش';
  if (s < 86400) return Math.floor(s / 3600) + ' ساعت پیش';
  return Math.floor(s / 86400) + ' روز پیش';
};

let _toastT = null;
DGX.toast = (m, bad) => {
  const t = DGX.$('#toast');
  t.textContent = m; t.className = 'show' + (bad ? ' err' : ' ok');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.className = '', bad ? 3600 : 2300);
};

DGX.haptic = kind => {
  if (!DGX.hapticSupported) return;   // old Telegram clients log warnings
  try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(kind || 'light'); } catch (_) {}
};
DGX.hselect = () => {
  try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); } catch (_) {}
};

DGX.skelCards = n => Array.from({ length: n }, () => `
  <div class="post">
    <div class="post-head"><div class="skel" style="width:40px;height:40px;border-radius:99px"></div>
      <div style="flex:1"><div class="skel" style="height:12px;width:45%;margin-bottom:6px"></div>
      <div class="skel" style="height:9px;width:30%"></div></div></div>
    <div class="skel" style="height:190px;border-radius:0"></div>
    <div style="padding:12px"><div class="skel" style="height:13px;width:70%;margin-bottom:8px"></div>
      <div class="skel" style="height:11px;width:40%"></div></div>
  </div>`).join('');

/* engagement stat pill for post cards */
DGX.statBtn = (icon, count, cls, attr) =>
  `<button class="stat ${cls || ''}" ${attr}>
     <svg><use href="#${icon}"/></svg><span>${DGX.kfmt(count)}</span></button>`;

/* ════════ SVG icon system (v1.2.1 — Instagram-style, zero-emoji UI) ════════
   Icons live as <symbol> in index.html; currentColor follows the theme. */
DGX.icon = (name, cls) =>
  `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* category key → icon name (fallback: i-box) */
DGX.CAT_ICONS = {
  ai: 'bot', prompts: 'chat', design: 'palette', templates: 'puzzle',
  dev: 'code', education: 'book', music: 'music', gaming: 'gamepad',
  photo: 'camera', video: 'film', threed: 'cube', business: 'briefcase',
  other: 'box',
};
DGX.catIcon = key => DGX.icon(DGX.CAT_ICONS[key] || 'box', 'cat-ic');

/* ════════ roles (v1.1: role-based UI) ════════ */
DGX.isAdmin  = () => !!(DGX.user && DGX.user.is_admin);
DGX.isHunter = () => (DGX.user && DGX.user.role === 'hunter');
DGX.roleFa = r => ({ associate: 'کارآموز', soldier: 'سرباز', capo: 'کاپو',
                     underboss: 'آندرباس', hunter: 'هانتر' }[r] || 'کاربر');

/* ════════ Glass web-address hub (links to platform web apps) ════════
   admin:true → only rendered for admins (server enforces the real guard,
   the UI just stops advertising the link to normal users).            */
DGX.hubItems = [
  { url: '/links',      ic: 'link',   t: 'هاب لینک', cls: '' },
  { url: '/admin',      ic: 'shield', t: 'پنل ادمین', cls: 'g-gold', admin: true },
  { url: '/insights',   ic: 'chart',  t: 'تحلیل',    cls: '',       admin: true },
  { url: '/live',       ic: 'live',   t: 'زنده', cls: 'g-green' },
  { url: '/cockpit',    ic: 'bot',    t: 'هرمسا وب', cls: '' },
  { url: '/shop',       ic: 'shop',   t: 'فروشگاه', cls: 'g-gold' },
  { url: '/landing',    ic: 'rocket', t: 'لندینگ', cls: '' },
  { url: 'tg://resolve?domain=DropAgentXBot', ic: 'send', t: 'بات', cls: 'g-green' },
  { url: '#/sitemap', ic: 'compass', t: '۵۰ صفحه', cls: '' },
];
DGX.hubItemsFor = () => DGX.hubItems.filter(it => !it.admin || DGX.isAdmin());

DGX.glassBtn = it => `
  <a class="glass-btn ${it.cls || ''}"
     href="${it.url}" ${it.url.startsWith('http') || it.url.startsWith('tg://') ? 'target="_blank"' : ''}
     onclick="DGX.haptic('light')">
    <span class="g-ic">${DGX.icon(it.ic)}</span>
    <span class="g-t">${it.t}</span>
  </a>`;

/* 4-button compact bar (used under home hero) */
DGX.hubBar = () => `<div class="hub-bar">${DGX.hubItemsFor().slice(0, 4).map(DGX.glassBtn).join('')}</div>`;

DGX.openHub = () => {
  const sheet = document.getElementById('hubSheet');
  DGX.haptic('medium');
  sheet.innerHTML = `
    <div class="panel">
      <div class="grip"></div>
      <div class="p-head">
        <span class="p-title">مکعب وب‌اپ‌ها</span>
        <span class="p-close" onclick="DGX.closeHub()">✕ بستن</span>
      </div>
      <div class="hub-list">${DGX.hubItemsFor().map(DGX.glassBtn).join('')}</div>
    </div>`;
  sheet.classList.add('open');
};
DGX.closeHub = () => {
  const s = document.getElementById('hubSheet');
  s.classList.remove('open'); s.innerHTML = '';
};

/* Instagram-style story rings from categories */
DGX.storiesBox = cats => `
  <div class="stories">
    <div class="story" onclick="location.hash='#/home?cat=all'">
      <div class="ring"><div class="inner">${DGX.icon('home', 'cat-ic')}</div></div>
      <div class="nm">همه</div>
    </div>
    ${(cats || []).map(c => `
    <div class="story" onclick="location.hash='#/home?cat=${c.key}'">
      <div class="ring"><div class="inner">${DGX.catIcon(c.key)}</div></div>
      <div class="nm">${c.fa}</div>
      <div class="ct">${DGX.kfmt(c.count)}</div>
    </div>`).join('')}
  </div>`;

/* product card → HTML (used by home/explore/search/profile) */
DGX.postCard = p => `
  <article class="post" data-pid="${+p.id}">
    <div class="post-head">
      <img class="avatar" src="/app/assets/logo.jpg" loading="lazy"
           onerror="this.style.opacity=.25">
      <div>
        <div class="p-name">${DGX.esc(p.creator_name || p.creator_username || 'سازنده')}
          <span class="vf">${DGX.icon('check','ic-xs')}</span></div>
        <div class="p-sub">@${DGX.esc(p.creator_username || 'dropagentx')} ·
          ${DGX.timeAgo(p.created_at || (Date.now() / 1000))}</div>
      </div>
      ${p.is_featured ? '<span class="p-more" style="color:var(--gold)">⭐</span>' : ''}
    </div>
    <a class="post-media" href="#/product?id=${+p.id}">
      ${p.photo_url
        ? `<img src="${DGX.esc(p.photo_url)}" alt="" loading="lazy"
               onerror="this.parentNode.innerHTML='<div style=&quot;height:170px&quot;></div>'">`
        : `<div class="ph-media">${DGX.icon('box', 'ic-xl')}</div>`}
      ${p.is_featured ? `<span class="badge-drop">${DGX.icon('flame','ic-s')} DROP ویژه</span>` : ''}
    </a>
    <div class="post-body">
      <a class="post-title" href="#/product?id=${+p.id}"
         style="text-decoration:none;color:inherit">${DGX.esc(p.title)}</a>
      <div class="post-desc">${DGX.esc(p.description || '')}</div>
      <div class="price-row">
        <span class="price num">${DGX.fmt(p.price_credits)} <small>کردیت</small></span>
        <span class="usd num">≈${(+p.usd || 0).toFixed(2)}$</span>
        <span style="margin-inline-start:auto;color:var(--dim2);font-size:11px;display:flex;align-items:center;gap:4px">
          ${DGX.icon('cart','ic-s')} ${DGX.kfmt(p.sales_count)} فروش</span>
      </div>
    </div>
    <div class="ig-actions">
      ${DGX.statBtn(p.liked ? 'i-heart-f' : 'i-heart', p.like_count,
                    p.liked ? 'on like' : '', `data-eng="like"`)}
      ${DGX.statBtn('i-comment', p.comment_count, '', `data-comments="1"`)}
      ${DGX.statBtn('i-save', p.save_count, p.saved ? 'on save' : '', `data-eng="save"`)}
      ${DGX.statBtn('i-repost', 0, '', `data-share="1"`)}
      <span class="stat ctr"><svg><use href="#i-eye"/></svg>
        <span>${DGX.kfmt(p.views)}</span> · CTR ${p.views ? Math.max(1, Math.round((+p.sales_count || 0) * 100 / p.views)) : '—'}%</span>
    </div>
    <div class="post-stats">
      ${DGX.statBtn('i-dislike', p.dislike_count, p.disliked ? 'on dislike' : '',
                    `data-eng="dislike"`)}
      <span style="margin-inline-start:auto;color:var(--dim2);font-size:10.5px;display:flex;align-items:center;gap:4px">${DGX.icon('cart','ic-s')} ${DGX.kfmt(p.sales_count)} فروش</span>
    </div>
    <div class="post-actions">
      <button class="btn btn-primary" data-buy="${+p.id}" data-title="${DGX.esc(p.title)}" data-price="${+p.price_credits || 0}">${DGX.icon('cart','ic-s')} خرید فوری</button>
      <button class="btn btn-ghost" onclick="location.hash='#/product?id=${+p.id}'">جزئیات ↗</button>
    </div>
  </article>`;


/* ════════ Share-to-DM (v1.2.1 — Instagram's #1 growth loop) ════════
   Inside Telegram: t.me/share/url lets the user pick ANY chat (DM/group)
   with a prefilled message — a real user-to-user invite, not just a copy. */
DGX.shareUrl = (url, text) => {
  DGX.haptic('medium');
  const t = window.Telegram?.WebApp;
  if (t && t.initData && t.openTelegramLink) {
    t.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url)
      + '&text=' + encodeURIComponent(text || 'اینو ببین روی DropAgentX 👀'));
    return;
  }
  if (navigator.share) { navigator.share({ url, title: text || 'DropAgentX' }).catch(() => {}); return; }
  navigator.clipboard.writeText(url)
    .then(() => DGX.toast('لینک کپی شد 🔗'))
    .catch(() => {});
};

/* ════════ Shared feed wiring (like/comment/save/share/buy) ════════
   v1.1: was previously private to home.js — search results referenced a
   non-existent DGX.wireFeed so their like/buy buttons did nothing.   */
/* ════════ v1.3 NEON: glass bottom-sheet + purchase flow (0xBazaar DNA) ════════ */
DGX.sheet = (html, wire) => {
  DGX.haptic('light');
  const o = document.createElement('div');
  o.className = 'novl';
  o.innerHTML = `<div class="nsheet"><div class="sheet-grip"></div>${html}</div>`;
  document.body.appendChild(o);
  requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
  o.addEventListener('click', e => { if (e.target === o) DGX.closeSheet(o); });
  if (wire) wire(o);
  return o;
};
DGX.closeSheet = o => { if (!o) return; o.classList.remove('show'); setTimeout(() => o.remove(), 220); };

DGX.confirmBuy = (p, done) => {
  const price = +p.price_credits || 0, bal = +DGX.user?.credits || 0;
  const img = p.feed_thumb || p.photo_url || '';
  DGX.sheet(`
    <h3>${DGX.icon('wallet')} تأیید خرید</h3>
    <div class="buy-prod">
      ${img ? `<img class="bp-img" src="${DGX.esc(img)}">`
            : `<span class="bp-img">${DGX.icon('box')}</span>`}
      <div style="flex:1;min-width:0">
        <b>${DGX.esc(p.title || 'محصول دیجیتال')}</b>
        ${p.seller ? `<span>${DGX.esc(p.seller)}</span>` : '<span>DropAgentX Market</span>'}
      </div>
      <b class="num" style="color:var(--em)">${DGX.fmt(price)}</b>
    </div>
    <div class="sumrow"><span>قیمت محصول</span><b class="num">${DGX.fmt(price)} کردیت</b></div>
    <div class="sumrow"><span>کارمزد خریدار</span><b class="free">۰ — رایگان</b></div>
    <div class="sumrow"><span>موجودی کیف پول شما</span><b class="num">${DGX.fmt(bal)}</b></div>
    ${bal < price ? `<div class="insuff">موجودی کافی نیست — از بات واریز کن (‎/start).</div>` : ''}
    <div class="sumrow total"><span>جمع پرداخت</span><b class="num">${DGX.fmt(price)} کردیت</b></div>
    <button class="btn btn-primary" id="cfGo" ${bal < price ? 'disabled style="opacity:.45"' : ''}>
      ${DGX.icon('cart', 'ic-s')} تأیید و پرداخت</button>
    <button class="btn btn-ghost" id="cfNo">انصراف</button>
  `, ov => {
    ov.querySelector('#cfNo').onclick = () => DGX.closeSheet(ov);
    ov.querySelector('#cfGo').onclick = async () => {
      const b = ov.querySelector('#cfGo');
      b.disabled = true; b.textContent = '⏳ در حال پردازش…';
      try {
        const r = await DGX.api(`/api/app/buy/${+p.id}`, { body: {} });
        DGX.closeSheet(ov);
        DGX.purchaseSuccess(p, r);
        DGX.refreshMe();
        if (done) done(r);
      } catch (e) {
        DGX.toast(e.msg || 'خرید ناموفق', true);
        b.disabled = false; b.innerHTML = DGX.icon('cart', 'ic-s') + ' تأیید و پرداخت';
      }
    };
  });
};

DGX.purchaseSuccess = (p, r) => {
  DGX.haptic('medium');
  const o = document.createElement('div');
  o.className = 'novl show';
  o.style.alignItems = 'center';
  o.style.padding = '22px';
  const tx = (r && (r.order_id || r.tx || r.id)) ? String(r.order_id || r.tx || r.id)
            : 'DGX-' + Date.now().toString(36).toUpperCase();
  const img = p.feed_thumb || p.photo_url || '';
  o.innerHTML = `
  <div class="nsheet ssheet">
    <div class="burst-wrap"><span class="ring-pulse"></span>
      <div class="burst success-ring">${DGX.icon('check')}</div></div>
    <h3 style="justify-content:center">خرید کامل شد</h3>
    <p style="color:var(--dim);font-size:12.5px;margin:-4px 0 14px">این محصول دیجیتال حالا مال توست.</p>
    <div class="buy-prod" style="text-align:start">
      ${img ? `<img class="bp-img" src="${DGX.esc(img)}">`
            : `<span class="bp-img">${DGX.icon('box')}</span>`}
      <div style="flex:1;min-width:0"><b>${DGX.esc(p.title || '')}</b>
        <span>تراکنش ${String(tx).slice(0, 10)}…</span></div>
    </div>
    ${r && r.file_url ? `<a class="btn btn-primary" href="${DGX.esc(r.file_url)}" target="_blank">
      ${DGX.icon('deposit', 'ic-s')} دانلود محصول</a>` : ''}
    <button class="btn btn-ghost" onclick="location.hash='#/activity';DGX.closeSheet(this.closest('.novl'))">
      ${DGX.icon('history', 'ic-s')} سفارش‌های من</button>
    <button class="btn btn-ghost" id="okShare">${DGX.icon('link', 'ic-s')} اشتراک‌گذاری خرید</button>
    <button class="lnk" id="okClose">بستن</button>
  </div>`;
  document.body.appendChild(o);
  o.querySelector('#okClose').onclick = () => DGX.closeSheet(o);
  o.querySelector('#okShare').onclick = () =>
    DGX.shareUrl(`${location.origin}/#/product?id=${+p.id}`, 'فقط خریدمش روی DropAgentX 🛍 یه نگاه بنداز');
  if (r && r.file_url) open(r.file_url, '_blank');
};

/* ════════ v2.0: local collections (likes / saved) + IG double-tap heart ════════ */
DGX.remember = (card, type, on) => {
  try {
    const k = type === 'save' ? 'dgx_saved' : 'dgx_liked';
    let l = JSON.parse(localStorage.getItem(k) || '[]');
    const id = +card.dataset.pid;
    if (!on) l = l.filter(x => x.id !== id);
    else if (!l.find(x => x.id === id)) l.unshift({
      id, t: Date.now(),
      title: (card.querySelector('.post-title') || {}).textContent || '',
      price: ((card.querySelector('.price') || {}).textContent || '').trim(),
      photo: (card.querySelector('.post-media img') || {}).src || '' });
    localStorage.setItem(k, JSON.stringify(l.slice(0, 200)));
  } catch (_) {}
};
DGX.localList = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return []; } };
DGX.dblLike = root => {   /* Instagram-style double-tap → big heart burst */
  root.querySelectorAll('.post-media').forEach(m => {
    if (m.dataset.dbl) return; m.dataset.dbl = '1';
    m.ondblclick = e => {
      e.preventDefault(); DGX.haptic('medium');
      const card = m.closest('.post'), btn = card && card.querySelector('[data-eng="like"]');
      const h = document.createElement('span');
      h.className = 'heart-pop'; h.innerHTML = DGX.icon('heart-f', 'ic-xl');
      m.appendChild(h); setTimeout(() => h.remove(), 750);
      if (btn && !btn.classList.contains('on')) btn.click();
    };
  });
};

/* ════════ v2.0: 7-day sales bars (dashboard/analytics) ════════ */
DGX.weekBars = rows => {
  const days = Array.from({ length: 7 }, () => 0);
  const now = Date.now() / 1000;
  (rows || []).forEach(o => {
    const age = now - (o.purchased_at || 0);
    if (age >= 0 && age < 7 * 86400) days[6 - Math.floor(age / 86400)] += (o.price_credits || 0);
  });
  const max = Math.max(1, ...days);
  const FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  return days.map((v, i) => `
    <div class="wb"><i style="height:${Math.max(6, Math.round(v / max * 64))}px"></i>
      <span>${v ? DGX.kfmt(v) : ''}</span><b>${FA[i]}</b></div>`).join('');
};

DGX.wireFeed = root => {
  root.querySelectorAll('[data-eng]').forEach(btn => btn.onclick = async () => {
    if (!DGX.requireAuth('لایک/سیو')) return;
    const card = btn.closest('.post'), pid = +card.dataset.pid, type = btn.dataset.eng;
    DGX.haptic('light');
    try {
      const r = await DGX.api('/api/app/engage', { body: { product_id: pid, type } });
      const cnt = btn.querySelector('span');
      cnt.textContent = DGX.kfmt(Math.max(0, (parseInt(cnt.textContent.replace(/[^\d]/g, ''), 10) || 0) + (r.on ? 1 : -1)));
      btn.classList.toggle('on', r.on);
        if (type === 'like' || type === 'save') DGX.remember(card, type, r.on);
      if (type === 'like') {
        const ic = btn.querySelector('use');
        ic.setAttribute('href', r.on ? '#i-heart-f' : '#i-heart');
      }
    } catch (e) { DGX.toast(e.msg || '', true); }
  });
  root.querySelectorAll('[data-comments]').forEach(btn => btn.onclick = () => {
    const card = btn.closest('.post');
    location.hash = '#/product?id=' + card.dataset.pid + '&comments=1';
  });
  root.querySelectorAll('[data-share]').forEach(btn => btn.onclick = () => {
    const card = btn.closest('.post');
    const p = card.querySelector('.post-title');
    DGX.shareUrl(location.origin + '/#/product?id=' + card.dataset.pid,
                 '🛍 ' + (p ? p.textContent : 'DropAgentX'));
  });
  /* v1.3: purchases flow through the neon confirm-sheet → success overlay */
  DGX.dblLike(root);
  root.querySelectorAll('[data-buy]').forEach(btn => btn.onclick = () => {
    if (!DGX.requireAuth('خرید')) return;
    DGX.confirmBuy({ id: +btn.dataset.buy, title: btn.dataset.title || '',
                     price_credits: +btn.dataset.price || 0 },
      () => { btn.textContent = '✅ خریده‌شد'; btn.disabled = true; });
  });
};

/* ════════ Pull-to-refresh (mobile-native feel, ~1KB) ════════ */
DGX.ptr = (el, onRefresh) => {
  if (!el) return;
  let startY = 0, pulling = false, dist = 0;
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.innerHTML = '<span class="ptr-i">↻</span>';
  el.parentNode.insertBefore(ind, el);
  const prevent = e => {
    if (pulling && dist > 8) e.preventDefault();
  };
  el.addEventListener('touchstart', e => {
    if (window.scrollY > 4 || DGX._ptrBusy) return;
    startY = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!pulling) return;
    dist = Math.max(0, e.touches[0].clientY - startY);
    if (dist > 0 && window.scrollY <= 0) {
      const k = Math.min(1, dist / 90);
      ind.style.height = (dist * .42) + 'px';
      ind.style.opacity = k;
      ind.classList.toggle('ready', dist > 70);
    }
  }, { passive: true });
  const done = () => { pulling = false; ind.style.height = '0px'; ind.style.opacity = 0; ind.classList.remove('ready'); };
  el.addEventListener('touchend', async () => {
    if (!pulling) return;
    if (dist > 70 && !DGX._ptrBusy) {
      DGX._ptrBusy = true;
      ind.querySelector('.ptr-i').classList.add('spin');
      DGX.haptic('medium');
      try { await onRefresh(); } catch (_) {}
      setTimeout(() => { DGX._ptrBusy = false; done();
        ind.querySelector('.ptr-i').classList.remove('spin'); }, 450);
    } else done();
  });
  document.addEventListener('touchmove', prevent, { passive: false });
};
