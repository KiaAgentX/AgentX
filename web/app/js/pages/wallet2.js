/* DropAgentX v2.0 — WALLET SUITE: deposit / withdraw / transactions / credits */
DGX.pages = DGX.pages || {};

DGX.pages.deposit = async (view) => {
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('deposit','ic-s')} واریز یعنی شارژ کردیت — همه‌چیز از بات و امن انجام می‌شود</p>
    <div class="post" style="padding:16px">
      <div class="chips" id="amts">${[100, 300, 500, 1000].map(a =>
        `<button class="chip num" data-a="${a}">${DGX.fmt(a)} کردیت</button>`).join('')}
        <button class="chip" data-a="custom">سایر…</button></div>
      <div class="field" id="custWrap" style="display:none"><label>مبلغ دلخواه (کردیت)</label><input id="custAmt" type="number" min="10"></div>
      <div class="insuff" style="background:#0f2b18;border-color:#1d4a2c;color:#8fffc4">
        ${DGX.icon('info','ic-s')} معادل دلاری روی همان لحظه در بات نشان داده می‌شود.</div>
      <button class="btn btn-primary" id="depGo">${DGX.icon('send','ic-s')} ادامه در بات</button>
      <a class="btn btn-ghost" href="#/credits">${DGX.icon('wallet','ic-s')} کردیت چیست؟</a>
    </div>
    <div class="post" style="padding:16px">
      <h3 style="margin-bottom:8px">${DGX.icon('shield','ic-s')} چرا از بات؟</h3>
      <div class="sumrow"><span>پرداخت داخل تلگرام</span><b>بدون خروج از اپ</b></div>
      <div class="sumrow"><span>تأیید دوطرفه</span><b>پیام + رسید</b></div>
      <div class="sumrow"><span>شارژ آنی</span><b>کمتر از ۱ دقیقه</b></div>
    </div>`;
  let amt = 100;
  const chips = view.querySelectorAll('#amts .chip');
  chips.forEach(c => c.onclick = () => {
    chips.forEach(x => x.classList.remove('on')); c.classList.add('on');
    DGX.$('#custWrap').style.display = c.dataset.a === 'custom' ? 'block' : 'none';
    amt = c.dataset.a;
  });
  chips[0].classList.add('on');
  DGX.$('#depGo').onclick = () => {
    const v = amt === 'custom' ? (+DGX.$('#custAmt').value || 0) : amt;
    DGX.openBot(v ? `/deposit ${v}` : '/deposit');
  };
};

DGX.pages.withdraw = async (view) => {
  let w = { credits: 0 };
  try { w = await DGX.api('/api/app/wallet'); } catch (_) {}
  view.innerHTML = `
    <p class="page-hint">${DGX.icon('withdraw','ic-s')} برداشت کردیت از فروش‌ها — مستقیم به کیف تلگرامی تو</p>
    <div class="post" style="padding:16px">
      <div class="sumrow"><span>موجودی فعلی</span><b class="num">${DGX.fmt(w.credits)} کردیت</b></div>
      <div class="sumrow total"><span>قابل برداشت</span><b class="num" style="color:var(--em)">${DGX.fmt(Math.max(0, w.credits))} </b></div>
      <button class="btn btn-primary" onclick="DGX.openBot('/withdraw')">${DGX.icon('send','ic-s')} درخواست برداشت</button>
      <a class="btn btn-ghost" href="#/payouts">${DGX.icon('shield','ic-s')} قوانین تسویه</a>
    </div>`;
};

DGX.pages.transactions = async (view) => {
  if (!DGX.requireAuth('تراکنش‌ها')) { location.hash = '#/wallet'; return; }
  view.innerHTML = DGX.skelCards(2);
  let w;
  try { w = await DGX.api('/api/app/wallet'); }
  catch (e) { view.innerHTML = `<div class="empty">${e.msg || 'خطا'}</div>`; return; }
  const F = { all: null, sale: ['wallet', 'فروش'], purchase: ['cart', 'خرید'],
              deposit: ['deposit', 'واریز'], withdraw: ['withdraw', 'برداشت'],
              task_completion: ['check', 'تسک'], referral_bonus: ['gift', 'ریفرال'] };
  const f = F[location.hash.split('f=')[1]?.slice(0, 12)] || 'all';
  const rows = (w.txs || []).filter(t => !F[f] || t.tx_type === f);
  const name = t => ({ sale: 'فروش', purchase: 'خرید', deposit: 'واریز', withdraw: 'برداشت',
    task_completion: 'تسک', referral_bonus: 'پاداز ریفرال', admin_grant: 'ادمین',
    admin_deduct: 'کسر ادمین', welcome: 'خوش‌آمد' })[t.tx_type] || t.tx_type;
  const icon = t => (F[t.tx_type] ? F[t.tx_type][0] : 'wallet');
  view.innerHTML = `
    <div class="chips">${Object.keys(F).map(k =>
      `<button class="chip ${f === k ? 'on' : ''}" onclick="location.hash='#/transactions?f=${k}'">
        ${k === 'all' ? 'همه' : name({ tx_type: k })}</button>`).join('')}</div>
    ${rows.length ? rows.map(t => `
      <div class="notif-row">
        <span class="nr-ic">${DGX.icon(icon(t))}</span>
        <div style="flex:1;min-width:0"><b>${name(t)}</b>
          <span class="p-sub">${DGX.esc(t.description || '')} · ${DGX.timeAgo(t.created_at || 0)}</span></div>
        <b class="num" style="color:${String(t.amount || '')[0] === '-' ? 'var(--dim)' : 'var(--em)'}">${DGX.fmt(t.amount)}</b>
      </div>`).join('') : `<div class="empty"><div class="big">${DGX.icon('history','big-ic')}</div>تراکنشی در این فیلتر نیست<br><br>
        <a class="btn btn-ghost" href="#/transactions?f=all">همه‌ی تراکنش‌ها</a></div>`}
    <div style="text-align:center;padding:12px"><a class="lnk" href="#/wallet">← کیف پول</a></div>`;
};

DGX.pages.credits = async (view) => {
  let info = { credits_per_usdt: 100 };
  try { info = await DGX.api('/api/pub/info'); } catch (_) {}
  const per = info.credits_per_usdt || 100;
  view.innerHTML = `
    <div class="post" style="padding:16px;text-align:center">
      <span class="nr-ic" style="width:52px;height:52px;margin:0 auto 8px">${DGX.icon('wallet')}</span>
      <b style="font-size:16px">کردیت، پولِ داخل DropAgentX است</b>
      <p class="p-sub" style="margin-top:6px">هر <b class="num">${DGX.fmt(per)}</b> کردیت ≈ ۱ دلار — برای خرید، فروش و هدیه</p>
    </div>
    <div class="post" style="padding:16px">
      <h3 style="margin-bottom:8px">${DGX.icon('chart','ic-s')} تبدیل سریع</h3>
      ${[50, 100, 500, 1000].map(c => `
        <div class="bar-row"><span class="num">${DGX.fmt(c)} کردیت</span><i></i><b class="num">≈${(c / per).toFixed(2)}$</b></div>`).join('')}
    </div>
    <div class="col-grid">
      <a class="col-card" href="#/deposit"><span class="cc-ic">${DGX.icon('deposit')}</span><b>شارژ کردیت</b></a>
      <a class="col-card" href="#/share"><span class="cc-ic">${DGX.icon('gift')}</span><b>کردیت رایگان با دعوت</b></a>
    </div>`;
};
