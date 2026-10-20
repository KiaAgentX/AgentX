/* DropAgentX — PROFILE: personal store (avatar 1:1 + cover 16:9) */
DGX.pages = DGX.pages || {};

DGX.pages.profile = async (view, params) => {
  if (!DGX.user) await DGX.refreshMe();
  const uid = +(params.uid || (DGX.user && DGX.user.id) || 0);
  if (!uid) { DGX.needTelegram(); return; }

  const d = await DGX.api(`/api/app/store/${uid}`);
  const per = DGX.perUsdt || 1000;
  const isMe = !!d.is_me;

  view.innerHTML = `
    <div class="cover-wrap" id="coverWrap">
      ${d.cover_url ? `<img src="${DGX.esc(d.cover_url)}">` :
        `<div style="height:100%;display:flex;align-items:center;justify-content:center;
           color:#1e2a24;font-size:15px;font-weight:800;letter-spacing:2px">
           DROPAGENTX · ${DGX.kfmt(d.total_sales)} SALES</div>`}
    </div>
    <div style="display:flex;align-items:flex-end;gap:12px;padding:0 var(--pad)">
      <img class="avatar-big" id="avImg"
           src="${d.avatar_url ? DGX.esc(d.avatar_url) : '/app/assets/logo.jpg'}">
      <div style="flex:1;padding-bottom:6px">
        <b style="font-size:17px">${DGX.esc(d.name || 'شهروند')} ✔</b>
          ${DGX.isAdmin() && isMe ? `<span class="badge-role admin">${DGX.icon('shield','ic-xs')} ادمین</span>` :
            (isMe && DGX.user?.role === 'hunter' ? `<span class="badge-role hunter">${DGX.icon('target','ic-xs')} هانتر</span>` : '')}
        <div style="color:var(--dim);font-size:11.5px">@${DGX.esc(d.username || 'dropagentx')}
          ${d.following_me ? '· شما را فالو می‌کند' : ''}</div>
        ${isMe && !DGX.isAdmin() && DGX.user?.role !== 'hunter' ?
          `<div style="color:var(--dim2);font-size:10.5px;margin-top:2px">${DGX.icon('trophy','ic-xs')} ${DGX.roleFa(DGX.user?.role)}</div>` : ''}
      </div>
      ${!isMe ? `<button class="follow-btn ${d.following_me ? 'on' : ''}" id="folBtn">
        ${d.following_me ? '✓ فالو شد' : '+ فالو'}</button>` : ''}
      ${isMe ? `<button class="pill-btn" onclick="DGX.upPhoto('avatar')">${DGX.icon('image','ic-s')} آواتار</button>
                <button class="pill-btn" onclick="DGX.upPhoto('cover')">${DGX.icon('palette','ic-s')} کاور</button>` : ''}
    </div>
    <input type="file" id="phFile" accept="image/jpeg,image/png" hidden>

    <div style="padding:0 var(--pad)">
      <div class="stat3">
        <div><b>${DGX.kfmt(d.followers)}</b><span>فالوور</span></div>
        <div><b>${d.products.length}</b><span>محصول</span></div>
        <div><b>${DGX.kfmt(d.total_sales)}</b><span>فروش</span></div>
        <div><b class="num">${(d.products.reduce((s, p) => s + (+p.price_credits || 0), 0) / 1000).toFixed(2)}$</b><span>ارزش مغازه</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <a class="btn btn-ghost" href="#/wallet">${DGX.icon('wallet','ic-s')} کیف پول</a>
        <a class="btn btn-ghost" href="#/activity">${DGX.icon('history','ic-s')} فعالیت</a>
        ${DGX.isAdmin() ? `<a class="btn btn-gold" href="/admin" target="_blank">${DGX.icon('shield','ic-s')} پنل مدیریت</a>
        <a class="btn btn-ghost" href="/insights" target="_blank">${DGX.icon('chart','ic-s')} تحلیل</a>` : ''}
        ${DGX.isHunter() ? `<a class="btn btn-ghost" href="https://t.me/DropAgentXBot?start=hunter">${DGX.icon('target','ic-s')} ابزار هانتر</a>` : ''}
      </div>
      <div style="margin-bottom:4px">${DGX.hubBar()}</div>
      <h3 style="margin-bottom:10px;display:flex;align-items:center;gap:6px">${DGX.icon('shop','ic-s')} ویترین ${isMe ? 'من' : 'این سازنده'}</h3>
      <div class="grid3" id="storeGrid"></div>
      <div style="height:80px"></div>
    </div>`;

  const grid = DGX.$('#storeGrid');
  grid.innerHTML = d.products.length ? d.products.map(p => `
    <a class="g-item" href="#/product?id=${+p.id}">
      ${p.photo_url ? `<img src="${DGX.esc(p.photo_url)}" loading="lazy">` : DGX.icon('box','ic-l ph-g')}
      <span class="g-price">${DGX.fmt(p.price_credits)}</span></a>`).join('')
    : `<div style="grid-column:1/-1;text-align:center;color:var(--dim);padding:26px;line-height:2">
         ${isMe ? 'هنوز محصولی نساختی<br>' : ''}
         <button class="btn btn-primary" onclick="location.hash='#/create'"
           style="${isMe ? '' : 'display:none'};max-width:220px;margin-top:8px">${DGX.icon('plus','ic-s')} ساخت اولین محصول</button>
       </div>`;

  if (!isMe) {
    DGX.$('#folBtn').onclick = async () => {
      const on = !d.following_me;
      try {
        await DGX.api('/api/app/follow', { body: { target: uid, on } });
        DGX.toast(on ? `فالو کردی ✅` : 'آنفالو شد');
        DGX.pages.profile(view, params);
      } catch (e) { DGX.toast(e.msg || '', true); }
    };
  }
};

DGX.upPhoto = kind => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/jpeg,image/png';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    // client-side aspect hint: avatar→square, cover→16:9 (server stores raw)
    const fd = new FormData(); fd.append('file', f);
    DGX.haptic('medium');
    try {
      const r = await fetch(`/api/app/me/photo/${kind}`, {
        method: 'POST', headers: { 'X-Requested-With': 'fetch',
                                   Authorization: 'Bearer ' + DGX.token },
        body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw d.detail || 'آپلود ناموفق';
      DGX.toast(kind === 'avatar' ? 'آواتار ۱:۱ ست شد ✨' : 'کاور ۱۶:۹ ست شد ✨');
      location.reload();
    } catch (e) { DGX.toast(typeof e === 'string' ? e : 'آپلود ناموفق', true); }
  };
  inp.click();
};
