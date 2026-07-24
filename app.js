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

/* ── מטמון מקומי — מציג נתונים מיידית בזמן שהשרת נטען (Apps Script איטי ~2-3ש') ── */
const Cache = {
  P: 'samuel_cache_',
  get(key) { try { return JSON.parse(localStorage.getItem(this.P + key)); } catch { return null; } },
  set(key, data) { try { localStorage.setItem(this.P + key, JSON.stringify(data)); } catch (e) {} },
};

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
    const first = !this.loaded.has(view);
    this.loaded.add(view);
    // כל מסך: בכניסה ראשונה טוען מלא; בכניסות הבאות מרענן ברקע (המטמון מציג מיד)
    if (view === 'schedule') this.loadSchedule();
    if (view === 'assign')   Assign.load();
    if (view === 'packing')  { if (first) Packing.load(); }   // צ׳קליסט מקומי — אין צורך לרענן
    if (view === 'games')    { if (first) Games.home(); else Games.refreshLeaderboard(); }
    if (view === 'wall')     Wall.load();
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

  // ── לוח חי: "עכשיו" + "הבא" (מחושב מהלו״ז) ──
  async loadNextActivity() {
    if (!CONFIGURED) return;
    let items = this.state.schedule || Cache.get('schedule');
    if (!items) {
      try { const res = await apiCall('getSchedule'); items = (res.success && res.schedule) ? res.schedule : []; this.state.schedule = items; Cache.set('schedule', items); }
      catch (e) { return; }
    }
    this._renderLiveBoard(items);
    // רענון עדין כל דקה כדי ש"עכשיו/הבא" יתקדמו לבד
    if (!this._liveTimer) this._liveTimer = setInterval(() => this._renderLiveBoard(this.state.schedule || items), 60000);
  },

  _renderLiveBoard(items) {
    const base = parseHebDate(this.setting('vacationStart', ''));
    const card = $('nextActivityCard'), body = $('nextActivityBody');
    if (!card || !body) return;
    if (!base || !items || !items.length) { card.style.display = 'none'; return; }
    const off = { 'יום ראשון': 0, 'יום שני': 1, 'יום שלישי': 2, 'יום רביעי': 3, 'יום חמישי': 4, 'יום שישי': 5, 'שבת': 6 };
    const now = Date.now();
    const timed = items
      .filter(it => off[it.day] != null)
      .map(it => {
        const m = fmtTimeCell(it.time).match(/^(\d{1,2}):(\d{2})/);
        const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off[it.day], m ? +m[1] : 9, m ? +m[2] : 0);
        return { it, t: dt.getTime() };
      })
      .sort((a, b) => a.t - b.t);
    if (!timed.length) { card.style.display = 'none'; return; }

    let nowItem = null, nextItem = null;
    for (let i = 0; i < timed.length; i++) {
      if (timed[i].t <= now) nowItem = timed[i];
      else { nextItem = timed[i]; break; }
    }
    // "עכשיו" נחשב פעיל רק אם עוד לא הגיע האירוע הבא (ובתוך חלון סביר של 4 שעות)
    const nowActive = nowItem && (now - nowItem.t < 4 * 3600000) && (!nextItem || nextItem.t > now);
    const started = timed[0].t <= now;   // הנופש התחיל
    if (!started) { card.style.display = 'none'; return; }   // לפני הנופש — ספירה לאחור מספיקה

    const eyebrow = card.querySelector('.eyebrow');
    if (eyebrow) eyebrow.innerHTML = '📍 מה קורה עכשיו';
    const rowHtml = (label, cls, o) => o ? `
      <div class="live-row ${cls}">
        <span class="live-tag">${label}</span>
        <div class="live-body">
          <div class="live-title">${typeIcon(o.it.type)} ${esc(o.it.title)}</div>
          <div class="muted live-meta">${esc(o.it.day)}${o.it.time ? ' · ' + esc(fmtTimeCell(o.it.time)) : ''}${o.it.detail ? ' · ' + esc(o.it.detail) : ''}</div>
        </div>
        ${cls === 'next' ? `<span class="chip coral live-when">${esc(relTime(o.t - now))}</span>` : '<span class="live-pulse">●</span>'}
      </div>` : '';

    let html = '';
    if (nowActive) html += rowHtml('עכשיו', 'now', nowItem);
    html += rowHtml('הבא', 'next', nextItem);
    if (!html) {
      const last = timed[timed.length - 1];
      html = `<div class="live-row"><div class="live-body"><div class="live-title">🎉 סיימנו את הנופש!</div><div class="muted live-meta">איזה יום היה לי סמואל</div></div></div>`;
      if (last && now - last.t > 6 * 3600000) { /* אחרי הכל */ }
    }
    body.innerHTML = html;
    card.style.display = 'block';
  },

  // ── לו״ז ──
  async loadSchedule() {
    const box = $('scheduleList');
    if (!CONFIGURED) { box.innerHTML = this.notConfiguredBanner() + Schedule.addBar() + emptyState('🗓️', 'הלו״ז יופיע כאן', 'זמין אחרי חיבור הגיליון'); return; }
    // מטמון → הצגה מיידית; אחרת ספינר
    const cached = App.state.schedule || Cache.get('schedule');
    if (cached && cached.length) { App.state.schedule = cached; Schedule.render(); }
    else box.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getSchedule');
      App.state.schedule = (res.success && res.schedule) ? res.schedule : [];
      Cache.set('schedule', App.state.schedule);
      Schedule.render();
    } catch (e) { if (!(cached && cached.length)) box.innerHTML = emptyState('😕', 'שגיאה בטעינת הלו״ז', e.message); }
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
    </div>
    <a class="btn btn-gold btn-block mb-md" href="assets/luz-aluma.pdf" target="_blank" rel="noopener">📄 הלו״ז המטריף שאלומה הכינה</a>`;
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
                    <button class="icon-btn-sm" onclick='Schedule.openEdit(${JSON.stringify(i).replace(/'/g, "&#39;")})' title="עריכה / מחיקה" aria-label="עריכה או מחיקה">✏️</button>
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
        <input class="form-input" id="scTime" type="time" value="${esc(fmtTimeCell(item.time) || '')}"></div>
      <div class="form-group"><label class="form-label">מה קורה?</label>
        <input class="form-input" id="scTitle" value="${esc(item.title || '')}" placeholder="לדוגמה: מנגל בחצר" maxlength="70"></div>
      <div class="form-group"><label class="form-label">סוג</label>
        <select class="form-select" id="scType">${this.TYPES.map(t => `<option value="${t[0]}" ${item.type === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">פירוט (לא חובה)</label>
        <textarea class="form-textarea" id="scDetail" placeholder="פרטים נוספים">${esc(item.detail || '')}</textarea></div>
      <div class="modal-footer">
        ${item.id ? `<button class="btn btn-danger" onclick="Schedule.remove('${item.id}')">מחיקה</button>` : ''}
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
  remove(id) {
    Modal.confirm('למחוק את האירוע מהלו״ז? אי אפשר לשחזר.', async () => {
      try {
        const res = await apiCall('deleteSchedule', { id });
        if (!res.success) throw new Error(res.message || 'שגיאה');
        showToast('נמחק', 'info'); App.loadSchedule();
      } catch (e) { showToast(e.message, 'error'); }
    }, { title: 'מחיקת אירוע', yes: 'מחק', danger: true });
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

  // עדכון נקודות + שמירה מקומית — כך שהצ'יפ מציג ערך מיידית בטעינה הבאה (לפני שהשרת עונה)
  setPoints(n) {
    this.points = n || 0;
    const p = this.get();
    if (p) { p.points = this.points; localStorage.setItem(this.KEY, JSON.stringify(p)); }
    this.updateChip();
  },

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
        this.setPoints(res.summary.myPoints);
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
    else this.refreshPoints();
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
        ${p.motto ? `<div class="profile-motto">״${esc(p.motto)}״</div>` : ''}
        <div class="chip gold mt-md">⭐ ${this.points} נקודות</div>
      </div>
      <div class="modal-footer" style="flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="Profile.openEdit()">✏️ עריכת פרופיל</button>
        <button class="btn btn-secondary btn-sm" onclick="Profile.confirmSwitch()">🔄 החלפת משתמש</button>
        <button class="btn btn-primary btn-block" onclick="App.go('games');Modal.hide()">🎮 לצבור נקודות</button>
      </div>`;
  },
  confirmSwitch() {
    Modal.confirm('להתנתק מהפרופיל הזה ולבחור אחר? הנקודות נשמרות בענן.', () => {
      this.clear(); this.open(); showToast('בחרו או צרו פרופיל', 'info');
    }, { title: 'החלפת משתמש', yes: 'החלף' });
  },

  // ── עריכת פרופיל (שם / אווטאר / מוטו) ──
  async openEdit() {
    const p = this.get(); if (!p) return;
    const used = await this.usedAvatars(p.avatar);
    Modal.show(`
      <div class="modal-header"><span class="modal-title">עריכת פרופיל</span>
        <button class="modal-close" onclick="Modal.hide()">×</button></div>
      <div class="form-group"><label class="form-label">שם</label>
        <input class="form-input" id="epName" value="${esc(p.name)}" maxlength="24"></div>
      <div class="form-group"><label class="form-label">משפחה (לא חובה)</label>
        <input class="form-input" id="epFamily" value="${esc(p.family || '')}" maxlength="30"></div>
      <div class="form-group"><label class="form-label">המוטו שלי (לא חובה)</label>
        <input class="form-input" id="epMotto" value="${esc(p.motto || '')}" maxlength="60" placeholder="לדוגמה: קיץ = אושר ☀️"></div>
      <div class="form-group"><label class="form-label">אווטאר</label>
        ${this.avatarPickerHtml(p.avatar, used)}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Profile.open()">→ חזרה</button>
        <button class="btn btn-primary btn-block" onclick="Profile.saveEdit()">שמירת שינויים</button>
      </div>`);
    this._avatar = p.avatar;
  },
  async saveEdit() {
    const name = $('epName').value.trim();
    const family = $('epFamily').value.trim();
    const motto = $('epMotto').value.trim();
    const avatar = this._avatar || this.get().avatar;
    if (!name) { showToast('צריך שם 🙂', 'warning'); return; }
    const p = this.get();
    if (!CONFIGURED) { this.set({ ...p, name, family, avatar, motto }); Modal.hide(); showToast('נשמר', 'success'); return; }
    const btn = event && event.target; if (btn) { btn.disabled = true; btn.textContent = 'שומר...'; }
    try {
      const res = await apiCall('updateUser', { id: p.id, name, family, avatar, motto });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      this.set({ ...p, name, family, avatar, motto });
      Modal.hide(); showToast('הפרופיל עודכן ✓', 'success'); playChime();
      // רענון תצוגות שמושפעות מהשם/אווטאר
      App.state.users = null;
      if (App.loaded.has('games')) Games.refreshLeaderboard();
      if (App.loaded.has('assign')) Assign.load();
      if (App.loaded.has('wall')) Wall.load();
    } catch (e) { showToast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'שמירת שינויים'; } }
  },

  // רשימת אווטארים שכבר תפוסים ע"י אחרים (למעט שלי)
  async usedAvatars(mine) {
    if (!CONFIGURED) return new Set();
    try {
      let users = App.state.users;
      if (!users) { const res = await apiCall('getUsers'); users = (res.success && res.users) ? res.users : []; App.state.users = users; }
      const s = new Set(users.map(u => u.avatar).filter(a => a && a !== mine));
      return s;
    } catch (e) { return new Set(); }
  },
  avatarPickerHtml(selected, used) {
    used = used || new Set();
    return `<div class="avatar-picker" id="npAvatars">
      ${CONFIG.AVATARS.map(a => {
        const taken = used.has(a) && a !== selected;
        return `<button class="avatar-opt ${a === selected ? 'selected' : ''} ${taken ? 'taken' : ''}" data-a="${a}" title="${taken ? 'כבר בשימוש' : ''}" onclick="Profile.pick(this)">${a}</button>`;
      }).join('')}
    </div>`;
  },

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

  async attachCreate() {
    const avatars = CONFIG.AVATARS;
    this._avatar = avatars[0];
    $('profileTabBody').innerHTML = `
      <div class="form-group"><label class="form-label">איך קוראים לכם?</label>
        <input class="form-input" id="npName" placeholder="לדוגמה: נעמה" maxlength="24"></div>
      <div class="form-group"><label class="form-label">איזו משפחה? (לא חובה)</label>
        <input class="form-input" id="npFamily" placeholder="לדוגמה: משפחת סמואל" maxlength="30"></div>
      <div class="form-group"><label class="form-label">המוטו שלי (לא חובה)</label>
        <input class="form-input" id="npMotto" placeholder="לדוגמה: קיץ = אושר ☀️" maxlength="60"></div>
      <div class="form-group"><label class="form-label">בחרו אווטאר</label>
        <div id="npAvatarWrap">${this.avatarPickerHtml(avatars[0], new Set())}</div></div>
      <div class="form-group"><label class="form-label">קוד אישי (4 ספרות, לא חובה)</label>
        <input class="form-input" id="npPin" inputmode="numeric" maxlength="4" placeholder="להתחברות ממכשירים נוספים">
        <div class="form-hint">מגן שלא יצברו נקודות בשמכם. אפשר להשאיר ריק.</div></div>
      <div class="modal-footer"><button class="btn btn-primary btn-block" onclick="Profile.create()">יאללה, מתחילים 🎒</button></div>`;
    // סימון אווטארים תפוסים ברקע (לא חוסם את הטופס)
    const used = await this.usedAvatars(avatars[0]);
    const wrap = $('npAvatarWrap');
    if (wrap) wrap.innerHTML = this.avatarPickerHtml(this._avatar, used);
  },
  pick(btn) {
    document.querySelectorAll('#npAvatars .avatar-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); this._avatar = btn.dataset.a;
  },

  async create() {
    const name = $('npName').value.trim();
    const family = $('npFamily').value.trim();
    const motto = ($('npMotto') || {}).value ? $('npMotto').value.trim() : '';
    const pin = $('npPin').value.trim();
    const avatar = this._avatar || '🙂';
    if (!name) { showToast('צריך שם 🙂', 'warning'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { showToast('הקוד צריך להיות 4 ספרות', 'warning'); return; }
    if (!CONFIGURED) { // מצב תצוגה מקדימה — פרופיל מקומי בלבד
      this.set({ id: 'local-' + Date.now(), name, family, avatar, motto });
      Modal.hide(); showToast(`שלום ${name}! (מצב תצוגה מקדימה)`, 'success'); return;
    }
    const btn = event && event.target; if (btn) { btn.disabled = true; btn.textContent = 'יוצר...'; }
    try {
      const res = await apiCall('createUser', { name, family, avatar, pin, motto });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      this.set({ id: res.user.id, name: res.user.name, family: res.user.family, avatar: res.user.avatar, motto: res.user.motto || motto });
      this.setPoints(0);
      App.state.users = null;
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
      App.state.users = users;
      body.innerHTML = `<div class="grid" style="max-height:300px;overflow-y:auto;">
        ${users.map(u => `
          <button class="check-row" style="text-align:start;" onclick='Profile.selectExisting(${JSON.stringify(u).replace(/'/g, "&#39;")})'>
            <span class="avatar">${u.avatar || '🙂'}</span>
            <span class="cr-text">${esc(u.name)}${u.hasPin ? ' 🔒' : ''}<div class="lb-fam">${esc(u.family || '')}${u.motto ? ' · ״' + esc(u.motto) + '״' : ''}</div></span>
            <span class="chip gold">⭐ ${u.points || 0}</span>
          </button>`).join('')}
      </div>`;
    } catch (e) { body.innerHTML = emptyState('😕', 'שגיאה', e.message); }
  },
  selectExisting(u) {
    if (u.hasPin) {
      Modal.prompt(`קוד אישי של ${u.name}`, async (pin) => {
        if (!pin) return;
        try {
          const res = await apiCall('loginUser', { id: u.id, pin: pin });
          if (!res.success) throw new Error(res.message || 'קוד שגוי');
          this._finishSelect(u);
        } catch (e) { showToast(e.message, 'error'); }
      }, { numeric: true, maxlength: 4, placeholder: '4 ספרות', yes: 'כניסה' });
      return;
    }
    this._finishSelect(u);
  },
  _finishSelect(u) {
    this.set({ id: u.id, name: u.name, family: u.family, avatar: u.avatar, motto: u.motto || '' });
    this.setPoints(u.points || 0);
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
    const cached = App.state.assignments || Cache.get('assignments');
    if (cached && cached.length) { App.state.assignments = cached; this.render(); }
    else box.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getAssignments');
      App.state.assignments = (res.success && res.assignments) ? res.assignments : [];
      Cache.set('assignments', App.state.assignments);
      this.render();
    } catch (e) { if (!(cached && cached.length)) box.innerHTML = emptyState('😕', 'שגיאה בטעינה', e.message); }
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
    // עדכון אופטימי — מציג מיד, מסתנכרן ברקע
    const a = (App.state.assignments || []).find(x => x.id === id);
    if (a) { a.claims = a.claims || []; if (!a.claims.some(c => c.userId === me.id)) a.claims.push({ userId: me.id, name: me.name, avatar: me.avatar, family: me.family || '' }); this.render(); }
    showToast('נרשמת! תודה 🙌', 'success'); playChime();
    try {
      const res = await apiCall('claimAssignment', { assignmentId: id, userId: me.id, name: me.name, avatar: me.avatar, family: me.family || '' });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      await this.load(); App.loadSummary();
    } catch (e) { showToast(e.message, 'error'); await this.load(); }
  },
  async unclaim(id) {
    const me = Profile.get(); if (!me) return;
    const a = (App.state.assignments || []).find(x => x.id === id);
    if (a && a.claims) { a.claims = a.claims.filter(c => c.userId !== me.id); this.render(); }
    showToast('השיבוץ בוטל', 'info');
    try {
      const res = await apiCall('unclaimAssignment', { assignmentId: id, userId: me.id });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      await this.load(); App.loadSummary();
    } catch (e) { showToast(e.message, 'error'); await this.load(); }
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
    const cached = Cache.get('packing');
    if (cached && cached.length) { this.items = cached; this.render(); }
    else box.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const res = await apiCall('getPacking');
      const items = (res.success && res.packing) ? res.packing : [];
      if (!items.length && !(cached && cached.length)) { box.innerHTML = emptyState('🎒', 'אין עדיין פריטים', 'הוסיפו שורות בגיליון packing'); return; }
      this.items = items; Cache.set('packing', items); this.render();
    } catch (e) { if (!(cached && cached.length)) box.innerHTML = emptyState('😕', 'שגיאה', e.message); }
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
    const album = App.setting('photosUrl', CONFIG.GOOGLE_PHOTOS_URL || '');
    $('wallComposer').innerHTML = `
      ${album ? `<a class="btn btn-pine btn-block mb-md" href="${esc(album)}" target="_blank" rel="noopener">📸 אלבום התמונות המשותף</a>` : ''}
      <div class="form-group"><textarea class="form-textarea" id="wallMsg" placeholder="מה בא לכם לשתף? טיפ, מחשבה, ברכה..." maxlength="600"></textarea></div>
      <div id="wallImgWrap" style="display:none;" class="mb-md">
        <input class="form-input" id="wallImg" placeholder="הדביקו קישור לתמונה (https://...)">
      </div>
      <div class="row between wrap-gap">
        <button class="btn btn-ghost btn-sm" id="wallImgToggle" onclick="Wall.toggleImg()">🖼️ הוספת תמונה מקישור</button>
        <button class="btn btn-primary" onclick="Wall.post()">📮 פרסום</button>
      </div>`;
    const feed = $('wallFeed');
    if (!CONFIGURED) { feed.innerHTML = App.notConfiguredBanner() + emptyState('📮', 'הקיר יופיע כאן', 'זמין אחרי חיבור הגיליון'); return; }
    const cached = Cache.get('posts');
    if (cached && cached.length) feed.innerHTML = this.feedHtml(cached);
    else feed.innerHTML = `<div class="center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    try {
      const me = Profile.get();
      const res = await apiCall('getPosts', me ? { userId: me.id } : {});
      const posts = (res.success && res.posts) ? res.posts : [];
      Cache.set('posts', posts);
      this.posts = posts;
      if (!posts.length) { feed.innerHTML = emptyState('📮', 'הקיר ריק — היו הראשונים!', ''); return; }
      feed.innerHTML = this.feedHtml(posts);
    } catch (e) { if (!(cached && cached.length)) feed.innerHTML = emptyState('😕', 'שגיאה', e.message); }
  },

  feedHtml(posts) {
    return posts.map(p => `
      <div class="wall-note">
        ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="wall-msg">${esc(p.message)}</div>
        <div class="wall-foot">
          <span class="avatar">${p.avatar || '🙂'}</span>
          <span class="wall-author">${esc(p.name)}</span>
          <button class="like-btn ${p.likedByMe ? 'liked' : ''}" onclick="Wall.like('${p.id}', this)" aria-label="לייק">
            <span class="like-ic">${p.likedByMe ? '❤️' : '🤍'}</span><span class="like-count">${p.likes || 0}</span>
          </button>
          <span class="wall-time">${timeAgo(p.ts)}</span>
        </div>
      </div>`).join('');
  },

  toggleImg() {
    const wrap = $('wallImgWrap'), btn = $('wallImgToggle');
    const show = wrap.style.display === 'none';
    wrap.style.display = show ? 'block' : 'none';
    btn.textContent = show ? '✖️ בלי תמונה' : '🖼️ הוספת תמונה מקישור';
  },

  async like(postId, btn) {
    if (!Profile.requireUser()) return;
    const me = Profile.get();
    // עדכון אופטימי
    const ic = btn.querySelector('.like-ic'), cnt = btn.querySelector('.like-count');
    const wasLiked = btn.classList.contains('liked');
    btn.classList.toggle('liked', !wasLiked);
    ic.textContent = wasLiked ? '🤍' : '❤️';
    cnt.textContent = Math.max(0, (parseInt(cnt.textContent) || 0) + (wasLiked ? -1 : 1));
    if (!wasLiked) btn.classList.add('pop');
    setTimeout(() => btn.classList.remove('pop'), 300);
    try {
      const res = await apiCall('likePost', { postId, userId: me.id });
      if (res.success) { cnt.textContent = res.count; btn.classList.toggle('liked', res.liked); ic.textContent = res.liked ? '❤️' : '🤍'; }
    } catch (e) { /* שקט — האופטימי כבר עדכן */ }
  },

  async post() {
    if (!Profile.requireUser()) return;
    const msg = $('wallMsg').value.trim();
    const imgEl = $('wallImg');
    const img = (imgEl && $('wallImgWrap').style.display !== 'none') ? imgEl.value.trim() : '';
    if (!msg && !img) { showToast('כתבו משהו לשיתוף', 'warning'); return; }
    const me = Profile.get();
    try {
      const res = await apiCall('addPost', { userId: me.id, name: me.name, avatar: me.avatar, family: me.family || '', message: msg, imageUrl: img });
      if (!res.success) throw new Error(res.message || 'שגיאה');
      $('wallMsg').value = ''; if (imgEl) imgEl.value = '';
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

  // אישור מעוצב (מחליף confirm של הדפדפן)
  confirm(message, onYes, opts = {}) {
    this._onYes = onYes;
    this.show(`
      <div class="modal-header"><span class="modal-title">${esc(opts.title || 'רגע, לוודא')}</span>
        <button class="modal-close" onclick="Modal.hide()">×</button></div>
      <p style="color:var(--text-secondary);line-height:1.6;">${esc(message)}</p>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-block" onclick="Modal.hide()">ביטול</button>
        <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'} btn-block" onclick="Modal._yes()">${esc(opts.yes || 'אישור')}</button>
      </div>`);
  },
  _yes() { const f = this._onYes; this._onYes = null; this.hide(); if (f) f(); },

  // קלט מעוצב (מחליף prompt של הדפדפן)
  prompt(title, onSubmit, opts = {}) {
    this._onSubmit = onSubmit;
    this.show(`
      <div class="modal-header"><span class="modal-title">${esc(title)}</span>
        <button class="modal-close" onclick="Modal.hide()">×</button></div>
      <div class="form-group">
        <input class="form-input" id="modalPromptInput" ${opts.numeric ? 'inputmode="numeric"' : ''} ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''} placeholder="${esc(opts.placeholder || '')}" onkeydown="if(event.key==='Enter')Modal._submit()">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-block" onclick="Modal.hide()">ביטול</button>
        <button class="btn btn-primary btn-block" onclick="Modal._submit()">${esc(opts.yes || 'אישור')}</button>
      </div>`);
    setTimeout(() => { const el = $('modalPromptInput'); if (el) el.focus(); }, 60);
  },
  _submit() { const f = this._onSubmit; const v = ($('modalPromptInput') || {}).value || ''; this._onSubmit = null; this.hide(); if (f) f(v.trim()); },
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

// טקסט זמן יחסי לעתיד ("בעוד ...")
function relTime(ms) {
  if (ms <= 60000) return 'עכשיו';
  const min = Math.round(ms / 60000);
  if (min < 60) return `בעוד ${min} דק׳`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `בעוד ${hr} שע׳`;
  return `בעוד ${Math.round(hr / 24)} ימים`;
}

/* ═══════════════════════════════════════════════════════════
   אתחול
   ═══════════════════════════════════════════════════════════ */
(async function init() {
  initTheme();
  App.buildNav();
  App.applySettings();          // ברירות מחדל מיידיות
  // פרופיל שנוצר במצב תצוגה מקדימה (id "local-") אינו תקף מול השרת — ננקה כדי למנוע כפילויות בטבלה
  if (CONFIGURED) { const _pp = Profile.get(); if (_pp && String(_pp.id).indexOf('local-') === 0) Profile.clear(); }
  Profile.points = (Profile.get() || {}).points || 0;   // נקודות אחרונות ידועות — מיידי
  Profile.updateChip();
  warmupServer();

  // מודאל: סגירה בלחיצה על הרקע
  $('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') Modal.hide(); });

  updateLoadingProgress(CONFIGURED ? 'טוען את הנופש...' : 'מצב תצוגה מקדימה');
  await App.loadSettings();
  App.applySettings();          // דריסה מהגיליון
  App.startCountdown();
  await Promise.all([App.loadSummary(), Profile.refreshPoints(), App.loadNextActivity()]);

  // ניווט לפי hash אם קיים
  const h = (location.hash || '').replace('#', '');
  if (SECTIONS.some(s => s.id === h) && h !== 'home') App.go(h);

  hideLoadingScreen();
})();
