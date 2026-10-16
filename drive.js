/* میڈیسن شیلف — گوگل ڈرائیو پر خودکار بیک اپ
   - ہر تبدیلی کے چند سیکنڈ بعد «تازہ ترین» فائل ڈرائیو پر اپڈیٹ (medicine-shelf-latest.json)
   - ہر دن کی الگ نقل بھی (medicine-shelf-YYYY-MM-DD.json)، 60 دن سے پرانی خود صاف
   - اجازت صرف drive.file: ایپ صرف اپنی بنائی فائلیں دیکھ سکتی ہے
   index.html سے window.MS_HOST کے ذریعے ڈیٹا ملتا ہے۔ */
(() => {
  'use strict';

  const DEFAULT_ACCOUNT = 'pbtcodelabs@gmail.com';   // جوڑتے وقت یہی اکاؤنٹ پہلے سے چنا ہوا آئے
  const CLIENT_ID = '954131537356-2be2rne30mje71l9qibosblvj3j0eqoj.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';
  const FOLDER_NAME = 'Medicine Shelf Backup';
  const LATEST_NAME = 'medicine-shelf-latest.json';
  const META_KEY = 'medicineShelf.drive';
  const KEEP_DAILY = 60;
  const AUTO_DELAY = 4000;
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  const $ = id => document.getElementById(id);
  const host = () => window.MS_HOST;
  const toast = m => host()?.toast(m);

  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { meta = {}; }
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} };

  let token = null, tokenExp = 0, tokenClient = null, busy = false, autoTimer = null, waitTap = false;
  const hasToken = () => token && Date.now() < tokenExp - 60000;

  const pad = n => String(n).padStart(2, '0');
  const dayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const when = iso => { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // ---------- گوگل کی اسکرپٹ ----------
  let gisPromise = null;
  function loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gisPromise = null; rej(new Error('gis')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  // ---------- اجازت ----------
  function getToken(interactive) {
    if (hasToken()) return Promise.resolve(token);
    if (!interactive) return Promise.reject(new Error('need-consent'));
    if (!navigator.onLine) return Promise.reject(new Error('offline'));
    return loadGis().then(() => new Promise((res, rej) => {
      if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
      tokenClient.callback = r => {
        if (r.error) { rej(new Error(r.error)); return; }
        token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        res(token);
      };
      tokenClient.error_callback = e => rej(new Error(e?.type || 'popup'));
      const opts = { prompt: meta.email ? '' : 'consent', hint: meta.email || DEFAULT_ACCOUNT };
      tokenClient.requestAccessToken(opts);
    }));
  }

  async function api(url, opt = {}) {
    const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + token, ...(opt.headers || {}) } });
    if (r.status === 401) { token = null; throw new Error('expired'); }
    if (!r.ok) throw new Error('http ' + r.status);
    return r;
  }

  async function whoAmI() {
    try {
      const j = await (await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();
      if (j.email) { meta.email = j.email; saveMeta(); }
    } catch (e) {}
  }

  async function ensureFolder() {
    if (meta.folderId) {
      try {
        const j = await (await api(`${DRIVE}/${meta.folderId}?fields=id,trashed`)).json();
        if (!j.trashed) return meta.folderId;
      } catch (e) { if (e.message === 'expired') throw e; }
      meta.folderId = null; meta.latestId = null; meta.dailyId = null;
    }
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found = await (await api(`${DRIVE}?q=${q}&fields=files(id)&spaces=drive`)).json();
    if (found.files?.length) { meta.folderId = found.files[0].id; saveMeta(); return meta.folderId; }
    const made = await (await api(DRIVE + '?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    })).json();
    meta.folderId = made.id; saveMeta(); return made.id;
  }

  async function listFiles() {
    const folder = await ensureFolder();
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const j = await (await api(`${DRIVE}?q=${q}&orderBy=modifiedTime desc&pageSize=200&fields=files(id,name,modifiedTime,appProperties)`)).json();
    return j.files || [];
  }

  function multipart(metaObj, content) {
    const b = 'ms' + Date.now();
    return {
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metaObj)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`
    };
  }
  async function upload(name, content, count, existingId) {
    const props = { appProperties: { meds: String(count), app: 'medicine-shelf' } };
    if (existingId) {
      return (await api(`${UPLOAD}/${existingId}?uploadType=multipart&fields=id`, { method: 'PATCH', ...multipart(props, content) })).json();
    }
    return (await api(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST', ...multipart({ name, mimeType: 'application/json', parents: [meta.folderId], ...props }, content)
    })).json();
  }

  // ---------- بیک اپ ----------
  async function backup(interactive) {
    if (busy) return false;
    busy = true; render();
    try {
      await getToken(interactive);
      if (!meta.email) await whoAmI();
      await ensureFolder();
      const meds = host().snapshot();
      const content = JSON.stringify({ app: 'MedicineShelf', version: host().version, savedAt: new Date().toISOString(), meds });
      let latestId = meta.latestId;
      if (!latestId) {
        const q = encodeURIComponent(`name='${LATEST_NAME}' and '${meta.folderId}' in parents and trashed=false`);
        latestId = (await (await api(`${DRIVE}?q=${q}&fields=files(id)`)).json()).files?.[0]?.id || null;
      }
      try { meta.latestId = (await upload(LATEST_NAME, content, meds.length, latestId)).id; }
      catch (e) { if (latestId && /404/.test(e.message)) meta.latestId = (await upload(LATEST_NAME, content, meds.length, null)).id; else throw e; }

      const today = dayStamp(), dailyName = `medicine-shelf-${today}.json`;
      if (meta.dailyDay === today && meta.dailyId) {
        try { await upload(dailyName, content, meds.length, meta.dailyId); }
        catch (e) { meta.dailyId = (await upload(dailyName, content, meds.length, null)).id; }
      } else {
        meta.dailyId = (await upload(dailyName, content, meds.length, null)).id; meta.dailyDay = today;
        cleanupOld().catch(() => {});
      }
      meta.lastDrive = new Date().toISOString(); meta.lastCount = meds.length; meta.pending = false;
      saveMeta();
      return meds.length;
    } catch (e) {
      handleErr(e, interactive);
      return false;
    } finally { busy = false; render(); }
  }

  async function cleanupOld() {
    const cutoff = dayStamp(new Date(Date.now() - KEEP_DAILY * 864e5));
    const old = (await listFiles()).filter(f => /^medicine-shelf-\d{4}-\d\d-\d\d\.json$/.test(f.name) && f.name.slice(15, 25) < cutoff);
    for (const f of old) await api(`${DRIVE}/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }

  let lastErr = '';
  function handleErr(e, interactive) {
    console.warn('drive', e);
    const m = e.message || '';
    lastErr = '';
    if (m === 'need-consent') return;
    if (!interactive && m === 'expired') return;
    lastErr =
      m === 'offline' ? 'انٹرنیٹ نہیں ہے، آن لائن ہو کر دوبارہ کریں' :
      m === 'gis' ? 'گوگل سے رابطہ نہیں ہو سکا، انٹرنیٹ دیکھیں' :
      /popup|access_denied/.test(m) ? 'گوگل اکاؤنٹ کی اجازت نہیں ملی' :
      'ڈرائیو پر محفوظ نہیں ہو سکا، دوبارہ کوشش کریں';
    toast(lastErr);
  }

  // ---------- واپس لانا ----------
  async function openRestore() {
    const box = $('driveFiles');
    host().openBox('driveBox');
    box.innerHTML = '<p class="hint" style="text-align:center">ڈرائیو سے فائلیں آ رہی ہیں…</p>';
    try {
      await getToken(true);
      if (!meta.email) await whoAmI();
      const files = (await listFiles()).filter(f => /\.json$/.test(f.name));
      render();
      if (!files.length) { box.innerHTML = '<p class="hint" style="text-align:center">ڈرائیو پر ابھی کوئی بیک اپ نہیں</p>'; return; }
      files.sort((a, b) => (b.name === LATEST_NAME) - (a.name === LATEST_NAME) || b.modifiedTime.localeCompare(a.modifiedTime));
      box.innerHTML = files.slice(0, 60).map(f => {
        const n = f.appProperties?.meds ?? '?';
        const m = f.name.match(/(\d{4})-(\d\d)-(\d\d)/);
        const lbl = f.name === LATEST_NAME ? `⭐ تازہ ترین — <span class="num">${when(f.modifiedTime)}</span>` : `📅 <span class="num">${m ? `${m[3]}-${m[2]}-${m[1]}` : f.name}</span> کی نقل`;
        return `<button type="button" class="dfile" data-id="${f.id}" data-n="${n}">${lbl}<span class="dn num">${n} دوائیاں</span></button>`;
      }).join('');
      box.querySelectorAll('.dfile').forEach(b => b.onclick = () => restoreFile(b.dataset.id, b.dataset.n));
    } catch (e) { box.innerHTML = ''; host().closeBox('driveBox'); handleErr(e, true); }
  }

  async function restoreFile(id, n) {
    if (!confirm(`${n} دوائیاں ڈرائیو سے واپس لائیں؟ فون کا موجودہ ریکارڈ بدل جائے گا۔`)) return;
    try {
      await getToken(true);
      const j = await (await api(`${DRIVE}/${id}?alt=media`)).json();
      const arr = Array.isArray(j) ? j : j.meds;
      if (!Array.isArray(arr)) throw new Error('bad');
      host().replace(arr);
      meta.lastDrive = new Date().toISOString(); meta.pending = false; meta.lastCount = arr.length; saveMeta();
      host().closeBox('driveBox'); host().closeBox('menuBox'); render();
      toast(`${arr.length} دوائیاں واپس آ گئیں ✔`);
    } catch (e) {
      if (e.message === 'bad') toast('یہ فائل درست بیک اپ نہیں'); else handleErr(e, true);
    }
  }

  // ---------- خودکار بیک اپ ----------
  function onChanged() {
    meta.pending = true; saveMeta(); render();
    if (!meta.email || !navigator.onLine) return;
    clearTimeout(autoTimer);
    if (!hasToken()) {
      // اجازت پہلے دی جا چکی ہے؛ ٹوکن ختم ہو تو اگلے ٹچ پر خاموشی سے نیا لے کر محفوظ کریں
      waitTap = true;
      getToken(true).then(() => { waitTap = false; autoTimer = setTimeout(() => backup(false), 500); }).catch(() => {});
      return;
    }
    autoTimer = setTimeout(() => { if (hasToken() && navigator.onLine) backup(false); }, AUTO_DELAY);
  }
  document.addEventListener('pointerdown', () => {
    if (!waitTap || busy || !meta.pending) return;
    waitTap = false;
    getToken(true).then(() => backup(false)).catch(() => { waitTap = true; });
  }, true);
  window.addEventListener('online', () => { if (meta.pending && meta.email) waitTap = true; });

  // ---------- جوڑنا / الگ کرنا ----------
  async function connect() {
    const n = await backup(true);
    if (n !== false) toast(`ڈرائیو سے جڑ گیا ✔ ${n} دوائیاں محفوظ`);
  }
  function disconnect() {
    if (!confirm('ڈرائیو سے خودکار بیک اپ بند کریں؟ ڈرائیو پر پہلے سے محفوظ فائلیں رہیں گی۔')) return;
    try { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    meta = {}; token = null; saveMeta(); render(); toast('ڈرائیو سے الگ کر دیا');
  }

  // ---------- دکھاوا ----------
  function render() {
    const st = $('driveStatus'), chip = $('driveChip');
    const on = !!meta.email;
    let txt, cls;
    if (busy) { txt = '⏳ ڈرائیو پر محفوظ ہو رہا ہے…'; cls = 'busy'; }
    else if (!on) { txt = '⚠️ ڈرائیو سے نہیں جڑا — ریکارڈ صرف اس فون میں ہے'; cls = 'warn'; }
    else if (meta.pending) { txt = '⏳ نئی تبدیلی ڈرائیو پر جانا باقی'; cls = 'warn'; }
    else { txt = `✅ ڈرائیو پر محفوظ — <span class="num">${when(meta.lastDrive)}</span>`; cls = 'ok'; }
    if (st) {
      st.className = 'dstatus ' + cls;
      st.innerHTML = txt + (on ? `<div class="hint num" style="direction:ltr;text-align:right">${meta.email}</div>` : '');
    }
    if (chip) { chip.className = 'menu-btn dchip ' + cls; chip.textContent = busy ? '⏳' : cls === 'ok' ? '☁️' : '⚠️'; }
    const c = $('btnDriveConnect'), d = $('btnDriveOff'), b = $('btnDriveNow');
    if (c) c.hidden = on;
    if (d) d.hidden = !on;
    if (b) { b.hidden = !on; b.disabled = busy; }
  }

  function wire() {
    $('btnDriveConnect')?.addEventListener('click', connect);
    $('btnDriveNow')?.addEventListener('click', async () => { const n = await backup(true); if (n !== false) toast(`${n} دوائیاں ڈرائیو پر محفوظ ✔`); });
    $('btnDriveRestore')?.addEventListener('click', openRestore);
    $('btnDriveOff')?.addEventListener('click', disconnect);
    window.addEventListener('ms-data-changed', onChanged);
    if (meta.email && navigator.onLine) loadGis().catch(() => {});
    if (meta.pending && meta.email) waitTap = true;
    render();
  }

  window.MS_DRIVE = { backup, openRestore, render, meta: () => meta };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
