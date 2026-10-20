/* DropAgentX — AGENT: هرمسا embedded chat (platform engine + memory + skills)
   v1.1 mobile: suggestion chips, keyboard-aware viewport (input never hidden
   under the OS keyboard), Enter=send on desktop / button on phones,
   session-persisted history, credit-aware send button. */
DGX.pages = DGX.pages || {};

DGX.pages.agent = async (view) => {
  if (!DGX.user) await DGX.refreshMe();

  const chips = ['یک محصول خفن پیشنهاد بده 🛍', 'برای فروش بهتر چی کار کنم؟',
                 'یه اسم و شعار بساز ✍️', 'متن معرفی ربات برام بنویس ✈️'];

  view.innerHTML = `
    <div style="background:var(--em-dim);border:1px solid var(--line);border-radius:14px;
         padding:11px 15px;margin-bottom:10px;font-size:12px;line-height:1.9">
      <span style="display:inline-flex;vertical-align:-4px;margin-inline-end:4px">${DGX.icon('spark','ic-s')}</span> <b>هرمسا آنلاینه</b> — هر پیام ۱ کردیت · موجودی: <b class="num">${DGX.fmt(DGX.user?.credits || 0)}</b>
    </div>
    <div class="chat-scroll" id="chatScroll"></div>
    <div class="qchips" id="qChips">
      ${chips.map(c => `<button class="chip">${c}</button>`).join('')}
    </div>
    <div class="agent-input">
      <textarea id="agIn" rows="1" placeholder="پیامت را بنویس…" maxlength="800"
        enterkeyhint="send"></textarea>
      <button class="btn btn-primary" id="agSend" style="flex:none;width:60px" aria-label="ارسال">${DGX.icon('send')}</button>
    </div>`;

  const scroll = DGX.$('#chatScroll'), inp = DGX.$('#agIn'),
        send = DGX.$('#agSend'), chipBox = DGX.$('#qChips');

  // ── history (survives in-app navigation) ──
  const hist = JSON.parse(sessionStorage.getItem('dgx_chat') || '[]');
  const paint = (text, me) => {
    const b = document.createElement('div');
    b.className = 'bubble ' + (me ? 'bub-me' : 'bub-bot');
    b.textContent = text;
    scroll.appendChild(b);
    return b;
  };
  hist.forEach(m => paint(m.t, m.me));
  if (!hist.length)
    paint('سلام عزیزم! من هرمسام 😊\\nهر چی لازم داری بپرس — گپ، ایده، ساخت فایل…', false);

  const bubble = (text, me) => {
    const b = paint(text, me);
    hist.push({ t: text, me });
    sessionStorage.setItem('dgx_chat', JSON.stringify(hist.slice(-60)));
    scroll.scrollTop = scroll.scrollHeight;
    return b;
  };

  // ── keyboard-aware layout (mobile) ──
  const vv = window.visualViewport;
  const onVv = () => {
    const kb = window.innerHeight - vv.height - vv.offsetTop;
    document.querySelector('.agent-input').style.bottom =
      Math.max(0, kb) + 'px';
    chipBox.style.display = kb > 60 ? 'none' : 'flex';
    scroll.style.minHeight = `calc(100dvh - 210px - ${Math.max(0, kb)}px)`;
    scroll.scrollTop = scroll.scrollHeight;
  };
  if (vv) { vv.addEventListener('resize', onVv); onVv(); }

  let busy = false;
  async function sendMsg(text) {
    text = (text || inp.value).trim();
    if (!text || busy) return;
    if (!DGX.requireAuth('گفتگو با هرمسا')) return;
    busy = true; send.disabled = true; inp.value = ''; inp.style.height = 'auto';
    chipBox.style.display = 'none';
    bubble(text, true); DGX.haptic('light');
    const typing = paint('', false);
    typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    scroll.scrollTop = scroll.scrollHeight;
    try {
      const r = await DGX.api('/api/app/agent', { body: { text } });
      typing.textContent = r.answer || '…';
      hist.push({ t: r.answer || '…', me: false });
      sessionStorage.setItem('dgx_chat', JSON.stringify(hist.slice(-60)));
      DGX.refreshMe(); DGX.haptic('medium');
    } catch (e) {
      typing.innerHTML = `⚠️ ${(e && e.msg) || 'ارور'}`;
      hist.pop(); sessionStorage.setItem('dgx_chat', JSON.stringify(hist.slice(-60)));
    }
    scroll.scrollTop = scroll.scrollHeight;
    busy = false; send.disabled = false;
  }

  send.onclick = () => sendMsg();
  const desktop = matchMedia('(pointer:fine)').matches;
  inp.addEventListener('keydown', e => {
    if (desktop && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(120, inp.scrollHeight) + 'px';
  });
  chipBox.querySelectorAll('.chip').forEach(c => c.onclick = () => { DGX.haptic('light'); sendMsg(c.textContent); });
};
