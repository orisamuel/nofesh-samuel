/**
 * app.js — ליבת האפליקציה: ניווט, פרופילים, בית, לו״ז, השתבצויות, מה להביא, קיר
 */

const CONFIGURED = !!(CONFIG.SCRIPT_URL && !CONFIG.SCRIPT_URL.includes('PASTE_'));

const SECTIONS = [
  { id: 'home',     label: 'בית',        icon: '🏠' },
  { id: 'schedule', label: 'לו״ז',       icon: '🗓️' },
  { id: 'assign',   label: 'השתבצויות',  icon: '✋' },
  { id: 'packing',  label: 'מה להביא',   icon: '🎒' },
  { id: 'games',    label: 'משחקים',     icon: '🎮' },
  { id: 'wall',     label: 'קיר',        icon: '📮' },
];

/* ═══════════════════════════════════════════════════════════
   App — ניווט, מצב, בית
   ═══════════════════════════════════════════════════════════ */
const App = {
  state: { settings: {}, assignments: null, packing: null, schedule: null, posts: null, summary: null },
  loaded: new Set(),
  cdTimer: null,

  buildNav() {
    const top = $('topNav'), bot = $('bottomNav');
    top.innerHTML = SECTIONS.map(s =>
      `<button class="nav-btn" data-nav="${s.id}" onclick="App.go('${s.id}')"><span class="ic">${s.icon}</span>${esc(s.label)}</button>`
    ).join('');
    bot.innerHTML = SECTIONS.map(s =>
      `<button class="bn-btn" data-nav="${s.id}" onclick="App.go('${s.id}')"><span class="ic">${s.icon}</span>${esc(s.label)}</button>`
    ).join('');
  },

  go(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    location.hash = view;
    // טעינה עצלה לפי מסך
    if (!this.loaded.has(view)) {
      this.loaded.add(view);
      if (view === 'schedule') this.loadSchedule();
      if (view === 'assign')   Assign.load();
      if (view === 'packing')  Packing.load();
      if (view === 'games')    Games.home();
      if (view === 'wall')     Wall.load();
    }
    // מרעננים טבלת מובילים / קיר בכל כניסה
    if (view === 'games' && this.loaded.has('games')) Games.refreshLeaderboard();
  },

  notConfiguredBanner() {
    if (CONFIGURED) return '';
    return `<div class="card" style="border-color:var(--warning);background:var(--warning-bg);margin-bottom:16px;">
      <strong>👀 מצב תצוגה מקדימה</strong>
      <p class="muted" style="margin-top:4px;font-size:0.88rem;">האתר עדיין לא מחובר לגיליון. אחרי הפריסה (ראו README) הנתונים יישמרו וישותפו לכל המשפחה.</p>
    </div>`;
  },

  // ── הגדרות (settings) ──
  async loadSettings() {
    if (!CONFIGURED) return;
    try {
      const res = await apiCall('getSettings');
      if (res.success && res.settings) this.state.settings = res.settings;
    } catch (e) { /* שקט — נשתמש בברירות מחדל */ }
  },
  setting(key, fallback) { return this.state.settings[key] || fallback; },

  applySettings() {
    const s = this.state.settings;
    const locName = this.setting('locationName', CONFIG.LOCATION_NAME);
    const locNote = this.setting('locationNote', CONFIG.LOCATION_NOTE);
    const waze = this.setting('wazeUrl', CONFIG.WAZE_URL);
    const maps = this.setting('mapsUrl', CONFIG.MAPS_URL);
    const sub = this.setting('slogan', CONFIG.APP_SUBTITLE);
    $('brandSub').textContent = sub;
    $('heroLocation').textContent = locName;
    $('heroYear').textContent = this.setting('year', CONFIG.APP_YEAR);
    $('locName').textContent = locName;
    $('locNote').textContent = locNote;
    ['wazeBtn', 'wazeBtn2'].forEach(id => $(id).href = waze);
    $('mapsBtn').href = maps;
  },

  // ── סיכום לבית ──
  async loadSummary() {
    const p = Profile.get();
    let summary = null;
    if (CONFIGURED) {
      try {
        const res = await apiCall('getSummary', p ? { userId: p.id } : {});
        if (res.success) summary = res.summary;
      } catch (e) {}
    }
    this.state.summary = summary;
    this.renderQuick(summary);
  },

  renderQuick(sum) {
    const cd = this.cdParts || {};
    const cards = [
      { ic: '⏳', num: (cd.days != null ? cd.days : '–'), label: cd.days != null ? 'ימים לנופש' : 'עוד רגע נדע', view: null },
      { ic: '✋', num: sum ? sum.openAssignments : '–', label: 'השתבצויות פתוחות', view: 'assign' },
      { ic: '⭐', num: Profile.get() ? Profile.points : 0, label: 'הנקודות שלי', view: 'games' },
      { ic: '📮', num: sum ? sum.wallCount : '–', label: 'הודעות בקיר', view: 'wall' },
    ];
    $('quickCards').innerHTML = cards.map(c =>
      `<button class="quick-card" ${c.view ? `onclick="App.go('${c.view}')"` : 'style="cursor:default;"'}>
        <span class="qc-ic">${c.ic}</span>
        <span class="qc-num">${esc(String(c.num))}</span>
        <span class="qc-label">${esc(c.label)}</span>
      </button>`
    ).join('');
  },

  // ── ספירה לאחור ──
  startCountdown() {
    const raw = this.setting('vacationStart', '');
    const target = parseHebDate(raw);
    const titleEl = $('countdownTitle');
    if (!target) {
      titleEl.textContent = 'התאריך יתעדכן בקרוב 🗓️';
      $('cdDays').textContent = $('cdHours').textContent = $('cdMin').textContent = $('cdSec').textContent = '–';
      return;
    }
    titleEl.textContent = 'הספירה לאחור לנופש סמואל';
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(this.cdTimer);
        $('countdownGrid').innerHTML = `<div style="grid-column:1/-1;" class="center countdown-live">🎉 אנחנו בנופש! איזה יום היה לי סמואל</div>`;
        this.cdParts = { days: 0 }; this.renderQuick(this.state.summary);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      $('cdDays').textContent = d; $('cdHours').textContent = String(h).padStart(2, '0');
      $('cdMin').textContent = String(m).padStart(2, '0'); $('cdSec').textContent = String(s).padStart(2, '0');
      this.cdParts = { days: d };
    };
    tick(); this.renderQuick(this.state.summary);
    this.cdTimer = setInterval(tick, 1000);
  },

  // ── לו״ז ──
  async loadSchedule() {
    const box = $('scheduleList');
    if (!CONFIGURED) { box.innerHTML = this.notConfiguredBanner() + Schedule.addBar() + emptyState('🗓️', 'הלו״ז יופיע כאן', 'זמין אחרי חיבור הגיליון'); return; }
    box.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getSchedule');
      App.state.schedule = (res.success && res.schedule) ? res.schedule : [];
      Schedule.render();
    } catch (e) { box.innerHTML = emptyState('😕', 'שגיאה בטעינת הלו״ז', e.message); }
  },
};

/* ═══════════════════════════════════════════════════════════
   Schedule — לו״ז שכל אחד יכול לערוך (הוספה/עריכה/מחיקה)
   ═══════════════════════════════════════════════════════════ */
const Schedule = {
  DAYS: ['יום ראשון', 'יום שני', 'יום שלישי'],
  TYPES: [['activity', '🎪 פעילות'], ['meal', '🍽️ ארוחה'], ['travel', '🚗 נסיעה'], ['other', '📍 אחר']],

  addBar() {
    return `<div class="row between wrap-gap mb-md">
      <span class="chip pine">📅 26–28 ביולי · ראשון–שלישי</span>
      <button class="btn btn-primary btn-sm" onclick="Schedule.openAdd()">➕ הוספת אירוע</button>
    </div>`;
  },

  render() {
    const box = $('scheduleList');
    const items = App.state.schedule || [];
    if (!items.length) { box.innerHTML = this.addBar() + emptyState('🗓️', 'אין עדיין אירועים בלו״ז', 'לחצו "הוספת אירוע" והתחילו!'); return; }
    const byDay = {};
    items.forEach(i => { const d = i.day || 'כללי'; (byDay[d] = byDay[d] || []).push(i); });
    box.innerHTML = this.addBar() + Object.keys(byDay).map(day => `
      <div class="day-block">
        <div class="day-header"><span class="day-badge">${esc(day)}</span><span class="day-line"></span>
          <button class="icon-btn-sm" onclick="Schedule.openAdd('${esc(day)}')" title="הוספה ליום זה">➕</button></div>
        <div class="timeline">
          ${byDay[day].map(i => `
            <div class="tl-item" data-type="${esc(i.type)}">
              <div class="tl-card">
                <div class="row between" style="align-items:flex-start; gap:8px;">
                  <div style="min-width:0;">
                    ${i.time ? `<div class="tl-time">${esc(fmtTimeCell(i.time))}</div>` : ''}
                    <div class="tl-title">${typeIcon(i.type)} ${esc(i.title)}</div>
                    ${i.detail ? `<div class="tl-detail">${esc(i.detail)}</div>` : ''}
                  </div>
                  <div class="tl-actions">
                    <button class="icon-btn-sm" onclick='Schedule.openEdit(${JSON.stringify(i).replace(/'/g, "&#39;")})' title="עריכה">✏️</button>
                    <button class="icon-btn-sm" onclick="Schedule.remove('${i.id}')" title="מחיקה">🗑️</button>
                  </div>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  },

  form(item) {
    item = item || {};
    return `
      <div class="modal-header"><span class="modal-title">${item.id ? 'עריכת אירוע' : 'אירוע חדש בלו״ז'}</span>
        <button class="modal-close" onclick="Modal.hide()">×</button></div>
      <div class="form-group"><label class="form-label">יום</label>
        <select class="form-select" id="scDay">${this.DAYS.map(d => `<option ${item.day === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">שעה</label>
        <input class="form-input" id="scTime" inputmode="numeric" placeholder="19:00" value="${esc(fmtTimeCell(item.time) || '')}"></div>
      <div class="form-group"><label class="form-label">מה קורה?</label>
        <input class="form-input" id="scTitle" value="${esc(item.title || '')}" placeholder="לדוגמה: מנגל בחצר" maxlength="70"></div>
      <div class="form-group"><label class="form-label">סוג</label>
        <select class="form-select" id="scType">${this.TYPES.map(t => `<option value="${t[0]}" ${item.type === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">פירוט (לא חובה)</label>
        <textarea class="form-textarea" id="scDetail" placeholder="פרטים נוספים">${esc(item.detail || '')}</textarea></div>
      <div class="modal-footer">
        ${item.id ? `<button class="btn btn-danger" onclick="Schedule.remove('${item.id}', true)">מחיקה</button>` : ''}
        <button class="btn btn-primary btn-block" onclick="Schedule.save('${item.id || ''}')">שמירה</button>
      </div>`;
  },
  openAdd(day) { Modal.show(this.form({ day: day || this.DAYS[0], type: 'activity' })); },
  openEdit(item) { Modal.show(this.form(item)); },

  async save(id) {
    const day = $('scDay').value, time = $('scTime').value.trim(), title = $('scTitle').value.trim();
    const type = $('scType').value, detail = $('scDetail').value.trim();
    if (!title) { showToast('צריך כותרת לאירוע', 'warning'); return; }
    try {
      const res = await apiCall(id ? 'updateSchedule' : 'addSchedule', { id, day, time, title, type, detail });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      Modal.hide(); showToast(id ? 'עודכן ✓' : 'נוסף ללו״ז 🗓️', 'success'); playChime();
      App.loadSchedule();
    } catch (e) { showToast(e.message, 'error'); }
  },
  async remove(id, fromModal) {
    if (!confirm('למחוק את האירוע מהלו״ז?')) return;
    try {
      const res = await apiCall('deleteSchedule', { id });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      if (fromModal) Modal.hide();
      showToast('נמחק', 'info'); App.loadSchedule();
    } catch (e) { showToast(e.message, 'error'); }
  },
};

/* ═══════════════════════════════════════════════════════════
   Profile — זהות, PIN, נקודות
   ═══════════════════════════════════════════════════════════ */
const Profile = {
  KEY: 'samuel_profile',
  points: 0,

  get() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; } },
  set(p) { localStorage.setItem(this.KEY, JSON.stringify(p)); this.updateChip(); },
  clear() { localStorage.removeItem(this.KEY); this.points = 0; this.updateChip(); },

  updateChip() {
    const p = this.get();
    $('chipAvatar').textContent = p ? p.avatar : '🙂';
    $('chipName').textContent = p ? p.name : 'מי אתם?';
    const pts = $('chipPoints');
    if (p) { pts.style.display = 'inline-flex'; $('chipPointsNum').textContent = this.points; }
    else pts.style.display = 'none';
  },

  async refreshPoints() {
    const p = this.get(); if (!p || !CONFIGURED) return;
    try {
      const res = await apiCall('getSummary', { userId: p.id });
      if (res.success && res.summary && typeof res.summary.myPoints === 'number') {
        this.points = res.summary.myPoints; this.updateChip();
      }
    } catch (e) {}
  },

  requireUser() {
    if (this.get()) return true;
    showToast('קודם ניצור לכם פרופיל 🙂', 'info');
    this.open();
    return false;
  },

  open() {
    const p = this.get();
    Modal.show(p ? this.viewProfile(p) : this.viewChooser());
    if (!p) this.attachCreate();
  },

  // תצוגת פרופיל קיים
  viewProfile(p) {
    return `
      <div class="modal-header"><span class="modal-title">הפרופיל שלי</span>
        <button class="modal-close" onclick="Modal.hide()">×</button></div>
      <div class="center">
        <div class="avatar" style="width:76px;height:76px;font-size:2.4rem;margin:0 auto 10px;">${p.avatar}</div>
        <h3 style="font-family:var(--font-display);font-size:1.5rem;">${esc(p.name)}</h3>
        <div class="muted">${esc(p.family || '')}</div>
        <div class="chip gold mt-md">⭐ ${this.points} נקודות</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-block" onclick="Profile.confirmSwitch()">החלפת משתמש</button>
        <button class="btn btn-primary btn-block" onclick="App.go('games');Modal.hide()">🎮 לצבור נקודות</button>
      </div>`;
  },
  confirmSwitch() { this.clear(); this.open(); showToast('התנתקתם. בחרו או צרו פרופיל', 'info'); },

  // בורר: חדש / קיים
  viewChooser() {
    return `
      <div class="modal-header"><span class="modal-title">ברוכים הבאים לנופש! 🌅</span>
        <button class="modal-close" onclick="Modal.hide()">×</button></div>
      <p class="muted mb-md">בחרו פרופיל קיים או צרו חדש — כדי להשתבץ, לשתף ולצבור נקודות.</p>
      <div class="subtabs">
        <button class="subtab active" id="pt-new" onclick="Profile.tab('new')">➕ פרופיל חדש</button>
        <button class="subtab" id="pt-existing" onclick="Profile.tab('existing')">👥 אני כבר רשום</button>
      </div>
      <div id="profileTabBody"></div>`;
  },
  tab(which) {
    $('pt-new').classList.toggle('active', which === 'new');
    $('pt-existing').classList.toggle('active', which === 'existing');
    if (which === 'new') { this.attachCreate(); } else { this.attachExisting(); }
  },

  attachCreate() {
    const avatars = CONFIG.AVATARS;
    $('profileTabBody').innerHTML = `
      <div class="form-group"><label class="form-label">איך קוראים לכם?</label>
        <input class="form-input" id="npName" placeholder="לדוגמה: נעמה" maxlength="24"></div>
      <div class="form-group"><label class="form-label">איזו משפחה? (לא חובה)</label>
        <input class="form-input" id="npFamily" placeholder="לדוגמה: משפחת סמואל" maxlength="30"></div>
      <div class="form-group"><label class="form-label">בחרו אווטאר</label>
        <div class="avatar-picker" id="npAvatars">
          ${avatars.map((a, i) => `<button class="avatar-opt ${i === 0 ? 'selected' : ''}" data-a="${a}" onclick="Profile.pick(this)">${a}</button>`).join('')}
        </div></div>
      <div class="form-group"><label class="form-label">קוד אישי (4 ספרות, לא חובה)</label>
        <input class="form-input" id="npPin" inputmode="numeric" maxlength="4" placeholder="להתחברות ממכשירים נוספים">
        <div class="form-hint">מגן שלא יצברו נקודות בשמכם. אפשר להשאיר ריק.</div></div>
      <div class="modal-footer"><button class="btn btn-primary btn-block" onclick="Profile.create()">יאללה, מתחילים 🎒</button></div>`;
    this._avatar = avatars[0];
  },
  pick(btn) {
    document.querySelectorAll('#npAvatars .avatar-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); this._avatar = btn.dataset.a;
  },

  async create() {
    const name = $('npName').value.trim();
    const family = $('npFamily').value.trim();
    const pin = $('npPin').value.trim();
    const avatar = this._avatar || '🙂';
    if (!name) { showToast('צריך שם 🙂', 'warning'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { showToast('הקוד צריך להיות 4 ספרות', 'warning'); return; }
    if (!CONFIGURED) { // מצב תצוגה מקדימה — פרופיל מקומי בלבד
      this.set({ id: 'local-' + Date.now(), name, family, avatar });
      Modal.hide(); showToast(`שלום ${name}! (מצב תצוגה מקדימה)`, 'success'); return;
    }
    const btn = event && event.target; if (btn) { btn.disabled = true; btn.textContent = 'יוצר...'; }
    try {
      const res = await apiCall('createUser', { name, family, avatar, pin });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      this.points = 0;
      this.set({ id: res.user.id, name: res.user.name, family: res.user.family, avatar: res.user.avatar });
      Modal.hide(); burstConfetti(80); playChime();
      showToast(`ברוכים הבאים, ${name}! 🎉`, 'success');
      App.loadSummary();
    } catch (e) { showToast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'יאללה, מתחילים 🎒'; } }
  },

  async attachExisting() {
    const body = $('profileTabBody');
    if (!CONFIGURED) { body.innerHTML = emptyState('🔌', 'זמין אחרי חיבור הגיליון', ''); return; }
    body.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:16px auto;"></div></div>`;
    try {
      const res = await apiCall('getUsers');
      const users = (res.success && res.users) ? res.users : [];
      if (!users.length) { body.innerHTML = emptyState('🤷', 'אין עדיין משתמשים', 'צרו פרופיל חדש'); return; }
      body.innerHTML = `<div class="grid" style="max-height:280px;overflow-y:auto;">
        ${users.map(u => `
          <button class="check-row" style="text-align:start;" onclick='Profile.selectExisting(${JSON.stringify(u).replace(/'/g, "&#39;")})'>
            <span class="avatar">${u.avatar || '🙂'}</span>
            <span class="cr-text">${esc(u.name)}<div class="lb-fam">${esc(u.family || '')}</div></span>
            <span class="chip gold">⭐ ${u.points || 0}</span>
          </button>`).join('')}
      </div>`;
    } catch (e) { body.innerHTML = emptyState('😕', 'שגיאה', e.message); }
  },
  async selectExisting(u) {
    if (u.hasPin) {
      const pin = prompt(`קוד אישי של ${u.name}:`);
      if (pin == null) return;
      try {
        const res = await apiCall('loginUser', { id: u.id, pin: pin.trim() });
        if (!res.success) throw new Error(res.message || 'קוד שגוי');
      } catch (e) { showToast(e.message, 'error'); return; }
    }
    this.points = u.points || 0;
    this.set({ id: u.id, name: u.name, family: u.family, avatar: u.avatar });
    Modal.hide(); showToast(`שלום ${u.name}! 👋`, 'success'); App.loadSummary();
  },
};

/* ═══════════════════════════════════════════════════════════
   Assign — השתבצויות (ארוחות / פעילויות / כלים)
   ═══════════════════════════════════════════════════════════ */
const Assign = {
  CATS: [
    { key: 'ארוחה',  label: '🍽️ ארוחות',  icon: '🍽️' },
    { key: 'פעילות', label: '🎪 פעילויות', icon: '🎪' },
    { key: 'כלי',    label: '🍳 כלים',     icon: '🍳' },
  ],
  current: 'ארוחה',

  async load() {
    this.renderTabs();
    const box = $('assignList');
    if (!CONFIGURED) { box.innerHTML = App.notConfiguredBanner() + emptyState('✋', 'ההשתבצויות יופיעו כאן', 'ערכו את גיליון assignments'); return; }
    box.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getAssignments');
      App.state.assignments = (res.success && res.assignments) ? res.assignments : [];
      this.render();
    } catch (e) { box.innerHTML = emptyState('😕', 'שגיאה בטעינה', e.message); }
  },

  renderTabs() {
    $('assignTabs').innerHTML = this.CATS.map(c =>
      `<button class="subtab ${c.key === this.current ? 'active' : ''}" onclick="Assign.tab('${c.key}')">${esc(c.label)}</button>`
    ).join('');
  },
  tab(key) { this.current = key; this.renderTabs(); this.render(); },

  render() {
    const box = $('assignList');
    const items = (App.state.assignments || []).filter(a => a.category === this.current);
    if (!items.length) { box.innerHTML = emptyState('📭', 'אין פריטים בקטגוריה הזו', ''); return; }
    const me = Profile.get();
    box.innerHTML = items.map(a => {
      const claims = a.claims || [];
      const claimed = claims.length;
      const needed = a.needed || 1;
      const full = claimed >= needed;
      const pct = Math.min(100, Math.round(claimed / needed * 100));
      const mineHere = me && claims.some(c => c.userId === me.id);
      const avatars = claims.slice(0, 6).map(c => `<span class="avatar" title="${esc(c.name)}">${c.avatar || '🙂'}</span>`).join('');
      const names = claims.map(c => c.name).join(', ');
      return `
      <div class="assign-item ${full ? 'full' : ''}">
        <div class="assign-top">
          <div><div class="assign-title">${esc(a.title)}</div>
            ${a.detail ? `<div class="assign-detail">${esc(a.detail)}</div>` : ''}
            ${a.day ? `<span class="chip pine mt-sm">${esc(a.day)}</span>` : ''}</div>
          <div class="assign-count ${full ? 'full' : ''}">${claimed}/${needed}</div>
        </div>
        <div class="progress-track"><div class="progress-fill ${full ? 'full' : ''}" style="width:${pct}%;"></div></div>
        <div class="assign-bottom">
          <div class="row">
            <div class="claim-avatars">${avatars || '<span class="muted" style="font-size:0.82rem;">עדיין אף אחד</span>'}</div>
            ${names ? `<span class="claim-names">${esc(names)}</span>` : ''}
          </div>
          ${mineHere
            ? `<button class="btn btn-danger btn-sm" onclick="Assign.unclaim('${a.id}')">ביטול השיבוץ שלי</button>`
            : (full ? `<span class="chip done">✓ מכוסה</span>`
                    : `<button class="btn btn-primary btn-sm" onclick="Assign.claim('${a.id}')">✋ אני לוקח/ת</button>`)}
        </div>
      </div>`;
    }).join('');
  },

  async claim(id) {
    if (!Profile.requireUser()) return;
    const me = Profile.get();
    try {
      const res = await apiCall('claimAssignment', { assignmentId: id, userId: me.id, name: me.name, avatar: me.avatar, family: me.family || '' });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      showToast('נרשמת! תודה 🙌', 'success'); playChime();
      await this.load(); App.loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
  },
  async unclaim(id) {
    const me = Profile.get(); if (!me) return;
    try {
      const res = await apiCall('unclaimAssignment', { assignmentId: id, userId: me.id });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      showToast('השיבוץ בוטל', 'info');
      await this.load(); App.loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
  },
};

/* ═══════════════════════════════════════════════════════════
   Packing — מה להביא (צ׳קליסט אישי ב-localStorage)
   ═══════════════════════════════════════════════════════════ */
const Packing = {
  KEY: 'samuel_packing',
  checks() { try { return new Set(JSON.parse(localStorage.getItem(this.KEY)) || []); } catch { return new Set(); } },
  saveChecks(set) { localStorage.setItem(this.KEY, JSON.stringify([...set])); },

  async load() {
    const box = $('packingList');
    if (!CONFIGURED) { box.innerHTML = App.notConfiguredBanner() + emptyState('🎒', 'רשימת הציוד תופיע כאן', 'ערכו את גיליון packing'); return; }
    box.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getPacking');
      const items = (res.success && res.packing) ? res.packing : [];
      if (!items.length) { box.innerHTML = emptyState('🎒', 'אין עדיין פריטים', 'הוסיפו שורות בגיליון packing'); return; }
      this.items = items; this.render();
    } catch (e) { box.innerHTML = emptyState('😕', 'שגיאה', e.message); }
  },

  render() {
    const checks = this.checks();
    const groups = {};
    this.items.forEach(i => { const g = i.scope || 'כללי'; (groups[g] = groups[g] || []).push(i); });
    const done = this.items.filter(i => checks.has(i.id)).length;
    $('packingList').innerHTML = `
      <div class="card mb-md row between">
        <strong>הצ׳קליסט שלי</strong>
        <span class="chip ${done === this.items.length ? 'done' : 'coral'}">${done}/${this.items.length} ✓</span>
      </div>
      ${Object.keys(groups).map(g => `
        <div class="eyebrow" style="margin:16px 0 8px;">${esc(g)}</div>
        ${groups[g].map(i => {
          const on = checks.has(i.id);
          return `<button class="check-row ${on ? 'checked' : ''}" onclick="Packing.toggle('${i.id}')">
            <span class="check-box">✓</span>
            <span class="cr-text">${esc(i.item)}${i.note ? `<div class="lb-fam">${esc(i.note)}</div>` : ''}</span>
            ${i.qty ? `<span class="cr-qty">×${esc(i.qty)}</span>` : ''}
          </button>`;
        }).join('')}
      `).join('')}`;
  },
  toggle(id) {
    const checks = this.checks();
    checks.has(id) ? checks.delete(id) : checks.add(id);
    this.saveChecks(checks); this.render();
  },
};

/* ═══════════════════════════════════════════════════════════
   Wall — קיר שיתוף
   ═══════════════════════════════════════════════════════════ */
const Wall = {
  async load() {
    $('wallComposer').innerHTML = `
      <div class="form-group"><textarea class="form-textarea" id="wallMsg" placeholder="מה בא לכם לשתף? טיפ, מחשבה, קישור לאלבום תמונות..." maxlength="600"></textarea></div>
      <div class="row between wrap-gap">
        <input class="form-input" id="wallImg" placeholder="קישור לתמונה (לא חובה)" style="flex:1;min-width:180px;">
        <button class="btn btn-primary" onclick="Wall.post()">📮 פרסום</button>
      </div>`;
    const feed = $('wallFeed');
    if (!CONFIGURED) { feed.innerHTML = App.notConfiguredBanner() + emptyState('📮', 'הקיר יופיע כאן', 'זמין אחרי חיבור הגיליון'); return; }
    feed.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getPosts');
      const posts = (res.success && res.posts) ? res.posts : [];
      if (!posts.length) { feed.innerHTML = emptyState('📮', 'הקיר ריק — היו הראשונים!', ''); return; }
      feed.innerHTML = posts.map(p => `
        <div class="wall-note">
          ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="wall-msg">${esc(p.message)}</div>
          <div class="wall-foot">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="wall-author">${esc(p.name)}</span>
            <span class="wall-time">${timeAgo(p.ts)}</span>
          </div>
        </div>`).join('');
    } catch (e) { feed.innerHTML = emptyState('😕', 'שגיאה', e.message); }
  },

  async post() {
    if (!Profile.requireUser()) return;
    const msg = $('wallMsg').value.trim();
    const img = $('wallImg').value.trim();
    if (!msg && !img) { showToast('כתבו משהו או הוסיפו קישור', 'warning'); return; }
    const me = Profile.get();
    try {
      const res = await apiCall('addPost', { userId: me.id, name: me.name, avatar: me.avatar, family: me.family || '', message: msg, imageUrl: img });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      $('wallMsg').value = ''; $('wallImg').value = '';
      showToast('פורסם! 🎉', 'success'); playChime();
      this.load(); App.loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
  },
};

/* ═══════════════════════════════════════════════════════════
   Modal — מודאל כללי
   ═══════════════════════════════════════════════════════════ */
const Modal = {
  show(html) { $('modalBox').innerHTML = html; $('modalBackdrop').classList.add('open'); },
  hide() { $('modalBackdrop').classList.remove('open'); },
};

/* ── עוזרי תצוגה ── */
function emptyState(ic, title, sub) {
  return `<div class="empty"><div class="empty-ic">${ic}</div><div class="empty-title">${esc(title)}</div>${sub ? `<div class="muted">${esc(sub)}</div>` : ''}</div>`;
}
function typeIcon(t) { return t === 'meal' ? '🍽️' : t === 'activity' ? '🎪' : t === 'travel' ? '🚗' : '📍'; }

// שעה מהתא — מטפל גם ב-"HH:mm" וגם בפורמט ISO ש-Sheets ממיר אליו אוטומטית
function fmtTimeCell(t) {
  if (!t) return '';
  const s = String(t);
  if (s.indexOf('T') === -1) return s;              // כבר "HH:mm"
  const d = new Date(s);
  if (isNaN(d)) return s;
  try { return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }); }
  catch (e) { return s; }
}

// תאריך מ-'dd/MM/yyyy [HH:mm]' או מפורמט ISO (Sheets ממיר תאריכים לערכי-תאריך)
function parseHebDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0);
    return isNaN(d) ? null : d;
  }
  const d2 = new Date(s);
  return isNaN(d2) ? null : d2;
}

/* ═══════════════════════════════════════════════════════════
   אתחול
   ═══════════════════════════════════════════════════════════ */
(async function init() {
  initTheme();
  App.buildNav();
  App.applySettings();          // ברירות מחדל מיידיות
  Profile.updateChip();
  warmupServer();

  // מודאל: סגירה בלחיצה על הרקע
  $('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') Modal.hide(); });

  updateLoadingProgress(CONFIGURED ? 'טוען את הנופש...' : 'מצב תצוגה מקדימה');
  await App.loadSettings();
  App.applySettings();          // דריסה מהגיליון
  App.startCountdown();
  await Promise.all([App.loadSummary(), Profile.refreshPoints()]);

  // ניווט לפי hash אם קיים
  const h = (location.hash || '').replace('#', '');
  if (SECTIONS.some(s => s.id === h) && h !== 'home') App.go(h);

  hideLoadingScreen();
})();
