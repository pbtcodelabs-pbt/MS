/* میڈیسن شیلف — نسخے
   ایک نسخہ = کس کا، کس ڈاکٹر سے، کس تاریخ کو، اور اس میں کون کون سی دوائیاں (دوائیوں کی شناخت rx.meds میں)
   نسخے index.html کے `rxs` میں رہتے ہیں اور persist() کے ساتھ محفوظ اور ڈرائیو پر جاتے ہیں۔ */
(() => {
  'use strict';

  // ---------- صفحے کے ڈبے ----------
  document.body.insertAdjacentHTML('beforeend', `
<div class="overlay" id="rxBox" style="z-index:18" onclick="if(event.target===this)closeBox('rxBox')">
  <div class="sheet rxsheet">
    <div id="rxHead"></div>
    <div class="rxselall"><label class="ck"><input type="checkbox" id="rxAll" checked onchange="rxToggleAll(this.checked)"><span></span></label> سب دوائیاں منتخب <span class="hint" id="rxSelInfo"></span></div>
    <div id="rxList"></div>
    <div class="rxbar">
      <button class="btn share" onclick="rxShare()">📤 شیئر</button>
      <button class="btn poster" onclick="rxPoster()">🖼️ پوسٹر</button>
      <button class="btn order" onclick="rxOrder()">🛒 منگوائیں</button>
    </div>
    <div class="row">
      <button class="btn edit" onclick="openRxForm(curRxId)">✏️ نسخہ تبدیل</button>
      <button class="btn del" onclick="deleteRx(curRxId)">🗑️ حذف</button>
      <button class="btn cancel" onclick="closeBox('rxBox')">واپس</button>
    </div>
  </div>
</div>

<div class="overlay" id="rxFormBox" style="z-index:18" onclick="if(event.target===this)closeBox('rxFormBox')">
  <div class="sheet">
    <h2 id="rxFormTitle">نیا نسخہ</h2>
    <label>کس کا نسخہ ہے؟</label>
    <input class="field" id="rWho" dir="auto" list="whoList" placeholder="مثلاً عبدالحفیظ">
    <label>ڈاکٹر کا نام</label>
    <input class="field" id="rDoctor" dir="auto" list="doctorList" placeholder="مثلاً ڈاکٹر احمد">
    <datalist id="doctorList"></datalist>
    <label>تاریخ</label>
    <input class="field num" id="rDate" type="date">
    <label>نوٹ <span class="hint">(بیماری، اسپتال وغیرہ)</span></label>
    <input class="field" id="rNote" dir="auto" placeholder="مثلاً بخار اور گلا خراب">

    <label>اس نسخے کی دوائیاں</label>
    <div id="rMeds" class="rmeds"></div>
    <div class="rmadd">
      <button type="button" class="btn save" onclick="rxNewMed()">➕ نئی دوائی لکھیں</button>
      <button type="button" class="btn edit" onclick="rxTogglePick()">📂 پہلے سے موجود دوائی چنیں</button>
    </div>
    <div id="rPick" class="rpick" hidden>
      <input class="field" id="rPickQ" dir="auto" placeholder="🔍 دوائی تلاش کریں…" oninput="rxRenderPick()">
      <div id="rPickList"></div>
    </div>

    <div class="row">
      <button class="btn save" onclick="saveRx()">✔ نسخہ محفوظ کریں</button>
      <button class="btn cancel" onclick="closeBox('rxFormBox')">واپس</button>
    </div>
  </div>
</div>`);

  const medById = id => meds.find(m => m.id === id);
  const rxMeds = r => (r.meds || []).map(medById).filter(Boolean);
  const rxTotal = list => list.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const rxTitle = r => r.doctor ? `ڈاکٹر ${r.doctor}` : 'نسخہ';

  // ---------- فہرست ----------
  function visibleRx() {
    const raw = $('q').value.trim();
    const words = qWords(raw).map(norm).filter(Boolean);
    let list = rxs.filter(r => !curCat || (curCat === '-' ? !r.who : r.who === curCat));
    if (words.length) {
      list = list.filter(r => {
        const hay = [r.who, r.doctor, r.note, fmtDate(r.date), ...rxMeds(r).map(m => `${m.name}|${m.company}|${m.uses}`)].map(norm).join('|');
        return words.every(w => hay.includes(w));
      });
    }
    return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.created || 0) - (a.created || 0));
  }

  window.renderRx = function () {
    const raw = $('q').value.trim();
    $('clearBtn').style.display = raw ? 'block' : 'none';
    $('selToggle').hidden = true;
    $('selbar').classList.remove('show');
    const list = visibleRx();
    $('countText').textContent = raw || curCat ? `${list.length} نسخے` : `کل ${rxs.length} نسخے`;
    $('totalText').textContent = '';
    const box = $('list');
    if (!list.length) {
      box.innerHTML = rxs.length
        ? `<div class="empty"><div class="big">🔎</div>کوئی نسخہ نہیں ملا</div>`
        : `<div class="empty"><div class="big">📋</div>ابھی کوئی نسخہ نہیں<br>ڈاکٹر نے جو دوائیاں اکٹھی دیں، انہیں ایک نسخے میں رکھیں<br>نیچے <b>+</b> دبا کر نیا نسخہ بنائیں</div>`;
      return;
    }
    box.innerHTML = list.map(r => {
      const ms = rxMeds(r), tot = rxTotal(ms);
      const thumbs = ms.slice(0, 5).map(m => `<span class="rxt ${m.photo ? 'has' : ''}" data-photo="${m.photo || ''}">💊</span>`).join('');
      return `<div class="rxcard" onclick="openRx('${r.id}')">
        <div class="rxc1">
          <div class="rxname">📋 ${hl(rxTitle(r), raw)}</div>
          ${tot ? `<div class="price num">${fmtPrice(tot)}</div>` : ''}
        </div>
        <div class="tags">${r.who ? `<span class="who">👤 ${hl(r.who, raw)}</span>` : ''}${r.date ? `<span class="date num">📅 ${fmtDate(r.date)}</span>` : ''}<span class="cnt">${ms.length} دوائیاں</span></div>
        ${r.note ? `<div class="note" dir="auto">📝 ${hl(r.note, raw)}</div>` : ''}
        <div class="rxmn" dir="auto">${ms.map(m => hl(m.name, raw)).join(' • ')}</div>
        <div class="rxthumbs">${thumbs}</div>
      </div>`;
    }).join('');
    fillThumbs(box);
  };

  async function fillThumbs(root) {
    for (const el of root.querySelectorAll('.rxt.has')) {
      try { const u = await Photos.url(el.dataset.photo); if (u) el.innerHTML = `<img src="${u}" alt="">`; } catch (e) {}
    }
  }

  // ---------- کھلا نسخہ ----------
  window.curRxId = null;
  let rxSel = new Set(), rxQty = {};
  window.openRx = function (id) {
    const r = rxs.find(x => x.id === id); if (!r) return;
    window.curRxId = id;
    const ms = rxMeds(r);
    rxSel = new Set(ms.map(m => m.id)); rxQty = {};
    const tot = rxTotal(ms);
    $('rxHead').innerHTML = `
      <h2>📋 ${esc(rxTitle(r))}</h2>
      <div class="rxinfo">
        ${r.who ? `<span class="who">👤 ${esc(r.who)}</span>` : ''}
        ${r.date ? `<span class="date num">📅 ${fmtDate(r.date)}</span>` : ''}
        <span class="cnt">${ms.length} دوائیاں</span>
        ${tot ? `<span class="price num">کل ${fmtPrice(tot)}</span>` : ''}
      </div>
      ${r.note ? `<div class="note" dir="auto">📝 ${esc(r.note)}</div>` : ''}`;
    $('rxList').innerHTML = ms.length ? ms.map(m => `
      <div class="rxrow on" data-id="${m.id}">
        <label class="ck"><input type="checkbox" checked onchange="rxPick('${m.id}', this.checked)"><span></span></label>
        <div class="rxph ${m.photo ? 'has' : ''}" data-photo="${m.photo || ''}" onclick="cardPhoto('${m.id}')">${m.photo ? '⏳' : '📷'}</div>
        <div class="rxd">
          <div class="rxr1"><b class="${isLatin(m.name) ? 'en' : ''}" dir="auto">${esc(m.name)}</b>${m.price !== '' && m.price != null ? `<span class="price num">${fmtPrice(m.price)}</span>` : ''}</div>
          ${m.company ? `<div class="company">🏭 <span dir="auto">${esc(m.company)}</span></div>` : ''}
          ${m.uses ? `<div class="uses" dir="auto"><b>علامات:</b> ${esc(m.uses)}</div>` : ''}
          ${m.note ? `<div class="howto" dir="auto">💊 <b>طریقۂ استعمال:</b> ${esc(m.note)}</div>` : ''}
          <div class="qty">تعداد <button onclick="rxQ('${m.id}',-1)">−</button><span class="num" id="q_${m.id}">1</span><button onclick="rxQ('${m.id}',1)">+</button></div>
        </div>
      </div>`).join('') : '<div class="empty">اس نسخے میں ابھی کوئی دوائی نہیں — «نسخہ تبدیل» سے دوائیاں شامل کریں</div>';
    $('rxAll').checked = true;
    rxSelInfo();
    openBox('rxBox');
    for (const el of $('rxList').querySelectorAll('.rxph.has')) {
      Photos.url(el.dataset.photo).then(u => { el.innerHTML = u ? `<img src="${u}" alt="">` : '☁️'; }).catch(() => {});
    }
  };
  function rxSelInfo() {
    const ms = rxMeds(rxs.find(x => x.id === curRxId) || {}).filter(m => rxSel.has(m.id));
    const t = rxTotal(ms);
    $('rxSelInfo').textContent = `(${ms.length} منتخب${t ? ` — ${fmtPrice(t)}` : ''})`;
  }
  window.rxPick = (id, on) => {
    on ? rxSel.add(id) : rxSel.delete(id);
    document.querySelector(`.rxrow[data-id="${id}"]`)?.classList.toggle('on', on);
    const r = rxs.find(x => x.id === curRxId);
    $('rxAll').checked = rxMeds(r).every(m => rxSel.has(m.id));
    rxSelInfo();
  };
  window.rxToggleAll = on => {
    const r = rxs.find(x => x.id === curRxId);
    rxMeds(r).forEach(m => {
      on ? rxSel.add(m.id) : rxSel.delete(m.id);
      const row = document.querySelector(`.rxrow[data-id="${m.id}"]`);
      if (row) { row.classList.toggle('on', on); row.querySelector('input').checked = on; }
    });
    rxSelInfo();
  };
  window.rxQ = (id, d) => {
    rxQty[id] = Math.max(1, (rxQty[id] || 1) + d);
    $('q_' + id).textContent = rxQty[id];
  };
  function selected() {
    const r = rxs.find(x => x.id === curRxId);
    const ms = rxMeds(r).filter(m => rxSel.has(m.id));
    if (!ms.length) { toast('پہلے کوئی دوائی منتخب کریں'); return null; }
    return { r, ms };
  }

  window.rxShare = () => { const s = selected(); if (s) shareMeds(s.ms.map(m => m.id), s.r); };

  // دوبارہ منگوانے کا پیغام
  window.rxOrder = async () => {
    const s = selected(); if (!s) return;
    let text = 'السلام علیکم 🌿\nبراہِ کرم یہ دوائیاں بھیج دیں:\n\n';
    s.ms.forEach((m, i) => {
      text += `${i + 1}) *${m.name}*${m.company ? ` (${m.company})` : ''} — تعداد: ${rxQty[m.id] || 1}\n`;
    });
    if (s.r.who) text += `\n👤 ${s.r.who}`;
    if (s.r.doctor) text += `\n👨‍⚕️ نسخہ: ڈاکٹر ${s.r.doctor}`;
    text += '\n\nشکریہ';
    try { if (navigator.share) { await navigator.share({ text }); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };

  // ---------- پوسٹر (تصویر بنا کر شیئر) ----------
  function loadImg(src) {
    return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  function fit(g, text, max) {
    text = String(text || '');
    if (g.measureText(text).width <= max) return text;
    while (text.length > 1 && g.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }
  window.rxPoster = async () => {
    const s = selected(); if (!s) return;
    toast('پوسٹر بن رہا ہے…');
    try { await Promise.all([document.fonts.load('40px Noori'), document.fonts.load('60px NooriKasheeda')]); } catch (e) {}
    const W = 1080, PAD = 40, HEAD = 330, ROW = 300, FOOT = 170;
    const c = document.createElement('canvas');
    c.width = W; c.height = HEAD + s.ms.length * ROW + FOOT;
    const g = c.getContext('2d');
    const U = 'Noori, "Jameel Noori Nastaleeq", serif', E = 'system-ui, Roboto, Arial, sans-serif';
    const uf = (px, b) => `${b ? 'bold ' : ''}${px}px ${U}`, ef = (px, b) => `${b ? 'bold ' : ''}${px}px ${E}`;
    // پس منظر
    let bg = g.createLinearGradient(0, 0, W, c.height);
    bg.addColorStop(0, '#ecfeff'); bg.addColorStop(.5, '#f5f3ff'); bg.addColorStop(1, '#fff1f2');
    g.fillStyle = bg; g.fillRect(0, 0, W, c.height);
    // سر
    let hg = g.createLinearGradient(0, 0, W, HEAD);
    hg.addColorStop(0, '#0d9488'); hg.addColorStop(.5, '#0891b2'); hg.addColorStop(1, '#7c3aed');
    g.fillStyle = hg; rr(g, 0, 0, W, HEAD - 20, [0, 0, 50, 50]); g.fill();
    g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = '#0f766e'; g.font = `84px NooriKasheeda, ${U}`; g.fillText('📋 نسخہ', W - PAD - 4, 92 + 5);
    g.fillStyle = '#fff'; g.fillText('📋 نسخہ', W - PAD, 92);
    g.font = uf(44);
    const line1 = [s.r.who ? `👤 ${s.r.who}` : '', s.r.doctor ? `👨‍⚕️ ڈاکٹر ${s.r.doctor}` : ''].filter(Boolean).join('     ');
    g.fillText(fit(g, line1, W - 2 * PAD), W - PAD, 190);
    g.font = uf(38);
    const line2 = [s.r.date ? `📅 ${fmtDate(s.r.date)}` : '', `${s.ms.length} دوائیاں`, s.r.note || ''].filter(Boolean).join('   •   ');
    g.fillText(fit(g, line2, W - 2 * PAD), W - PAD, 258);
    // دوائیاں
    let y = HEAD;
    for (const m of s.ms) {
      g.save();
      g.shadowColor = 'rgba(76,29,149,.18)'; g.shadowBlur = 20; g.shadowOffsetY = 8;
      g.fillStyle = '#fff'; rr(g, PAD, y + 10, W - 2 * PAD, ROW - 30, 36); g.fill();
      g.restore();
      // کیپسول پٹی
      let cg = g.createLinearGradient(0, y + 40, 0, y + ROW - 50);
      cg.addColorStop(0, '#f43f5e'); cg.addColorStop(.5, '#f43f5e'); cg.addColorStop(.5, '#fbbf24'); cg.addColorStop(1, '#fbbf24');
      g.fillStyle = cg; rr(g, W - PAD - 26, y + 40, 12, ROW - 90, 6); g.fill();
      // تصویر
      const px = PAD + 24, py = y + 34, ps = ROW - 78;
      g.fillStyle = '#ede9fe'; rr(g, px, py, ps, ps, 24); g.fill();
      let img = null;
      if (m.photo) { try { const u = await Photos.url(m.photo); if (u) img = await loadImg(u); } catch (e) {} }
      if (img) {
        g.save(); rr(g, px, py, ps, ps, 24); g.clip();
        const k = Math.max(ps / img.width, ps / img.height), iw = img.width * k, ih = img.height * k;
        g.drawImage(img, px + (ps - iw) / 2, py + (ps - ih) / 2, iw, ih); g.restore();
      } else { g.textAlign = 'center'; g.font = '90px sans-serif'; g.fillText('💊', px + ps / 2, py + ps / 2); }
      // لکھائی
      const tx = W - PAD - 50, tw = tx - (px + ps + 30);
      g.textAlign = 'right'; g.fillStyle = '#0f766e';
      g.font = isLatin(m.name) ? ef(50, true) : uf(56, true);
      g.direction = isLatin(m.name) ? 'ltr' : 'rtl';
      g.textAlign = isLatin(m.name) ? 'right' : 'right';
      g.fillText(fit(g, m.name, tw - 170), tx, y + 70);
      g.direction = 'rtl';
      if (m.price !== '' && m.price != null) {
        g.font = ef(36, true); const pt = fmtPrice(m.price), pw = g.measureText(pt).width + 36;
        const bx = px + ps + 30;
        g.fillStyle = '#ccfbf1'; rr(g, bx, y + 44, pw, 54, 27); g.fill();
        g.fillStyle = '#0f766e'; g.textAlign = 'center'; g.direction = 'ltr'; g.fillText(pt, bx + pw / 2, y + 72);
        g.direction = 'rtl'; g.textAlign = 'right';
      }
      let ly = y + 128;
      g.fillStyle = '#64748b'; g.font = isLatin(m.company) ? ef(34) : uf(36);
      if (m.company) { g.fillText(fit(g, '🏭 ' + m.company, tw), tx, ly); ly += 52; }
      g.fillStyle = '#0f172a'; g.font = uf(36);
      if (m.uses) { g.fillText(fit(g, 'علامات: ' + m.uses, tw), tx, ly); ly += 52; }
      g.fillStyle = '#6d28d9'; g.font = uf(34);
      if (m.note) { g.fillText(fit(g, '💊 ' + m.note, tw), tx, ly); }
      y += ROW;
    }
    // پاؤں
    const tot = rxTotal(s.ms);
    g.fillStyle = '#0f766e'; g.textAlign = 'right'; g.font = uf(46, true);
    if (tot) g.fillText(`💰 کل قیمت: ${fmtPrice(tot)}`, W - PAD, y + 50);
    g.fillStyle = '#7c3aed'; g.textAlign = 'left'; g.font = `44px NooriKasheeda, ${U}`;
    g.fillText('💊 میڈیسن شیلف', PAD, y + 120);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .9));
    const name = `nuskha-${(s.r.who || 'rx').replace(/\s+/g, '-')}-${s.r.date || ''}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'نسخہ' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('پوسٹر محفوظ ہو گیا ✔');
  };

  // ---------- نسخہ بنانا / بدلنا ----------
  let formRxId = null, formMeds = [];
  window.openRxForm = function (id) {
    formRxId = id || null;
    const r = rxs.find(x => x.id === id) || { who: curCat && curCat !== '-' ? curCat : '', date: today() };
    $('rxFormTitle').textContent = id ? 'نسخہ تبدیل کریں' : 'نیا نسخہ';
    $('rWho').value = r.who || ''; $('rDoctor').value = r.doctor || ''; $('rDate').value = r.date || ''; $('rNote').value = r.note || '';
    formMeds = [...(r.meds || [])];
    $('doctorList').innerHTML = [...new Set(rxs.map(x => x.doctor).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('');
    $('rPick').hidden = true; $('rPickQ').value = '';
    renderFormMeds();
    closeBox('rxBox');
    openBox('rxFormBox');
  };
  function renderFormMeds() {
    const ms = formMeds.map(medById).filter(Boolean);
    $('rMeds').innerHTML = ms.length ? ms.map(m => `<span class="rmchip">💊 <span dir="auto">${esc(m.name)}</span><button type="button" onclick="rxRemoveMed('${m.id}')">✕</button></span>`).join('')
      : '<div class="hint">ابھی کوئی دوائی نہیں — نیچے سے شامل کریں</div>';
    if (!$('rPick').hidden) rxRenderPick();
  }
  window.rxRemoveMed = id => { formMeds = formMeds.filter(x => x !== id); renderFormMeds(); };
  window.rxTogglePick = () => { $('rPick').hidden = !$('rPick').hidden; if (!$('rPick').hidden) rxRenderPick(); };
  window.rxRenderPick = () => {
    const words = qWords($('rPickQ').value).map(norm).filter(Boolean);
    const who = $('rWho').value.trim();
    let list = meds.filter(m => !words.length || words.every(w => [m.name, m.company, m.uses, m.who].map(norm).join('|').includes(w)));
    list.sort((a, b) => ((b.who === who) - (a.who === who)) || a.name.localeCompare(b.name));
    $('rPickList').innerHTML = list.slice(0, 80).map(m => `
      <label class="pkrow"><span class="ck"><input type="checkbox" ${formMeds.includes(m.id) ? 'checked' : ''} onchange="rxPickMed('${m.id}', this.checked)"><span></span></span>
      <span dir="auto"><b>${esc(m.name)}</b>${m.company ? ' — ' + esc(m.company) : ''}${m.who ? ' — 👤 ' + esc(m.who) : ''}</span></label>`).join('')
      || '<div class="hint">کوئی دوائی نہیں ملی</div>';
  };
  window.rxPickMed = (id, on) => {
    if (on && !formMeds.includes(id)) formMeds.push(id);
    if (!on) formMeds = formMeds.filter(x => x !== id);
    const keep = $('rPick').hidden; renderFormMeds(); $('rPick').hidden = keep;
  };
  // نئی دوائی: دوائی کا فارم کھولیں، محفوظ ہوتے ہی اس نسخے میں
  window.rxNewMed = () => {
    const who = $('rWho').value.trim(), date = $('rDate').value;
    window.onMedAdded = id => { if (!formMeds.includes(id)) formMeds.push(id); renderFormMeds(); };
    openForm();
    $('fWho').value = who; if (date) $('fDate').value = date;
  };
  // دوائی کا فارم بند ہو تو یہ عارضی جوڑ ختم
  new MutationObserver(() => { if (!$('formBox').classList.contains('show')) setTimeout(() => { window.onMedAdded = null; }, 0); })
    .observe($('formBox'), { attributes: true, attributeFilter: ['class'] });

  window.saveRx = function () {
    const data = { who: $('rWho').value.trim(), doctor: $('rDoctor').value.trim(), date: $('rDate').value, note: $('rNote').value.trim(), meds: [...formMeds], updated: Date.now() };
    if (!data.meds.length && !data.doctor && !data.who) { toast('نام، ڈاکٹر یا کوئی دوائی لکھیں'); return; }
    let id = formRxId;
    if (id) { const r = rxs.find(x => x.id === id); if (r) Object.assign(r, data); }
    else { id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); rxs.push({ id, created: Date.now(), ...data }); }
    persist(); closeBox('rxFormBox');
    if (curTab !== 'rx') setTab('rx'); else render();
    toast('نسخہ محفوظ ہو گیا ✔');
    openRx(id);
  };
  window.deleteRx = function (id) {
    const r = rxs.find(x => x.id === id); if (!r) return;
    if (!confirm(`یہ نسخہ (${rxTitle(r)}) حذف کریں؟ دوائیاں اپنی جگہ رہیں گی۔`)) return;
    rxs = rxs.filter(x => x.id !== id);
    persist(); closeBox('rxBox'); render(); toast('نسخہ حذف ہو گیا');
  };
})();
