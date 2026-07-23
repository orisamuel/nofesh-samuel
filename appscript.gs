// ============================================================
// נופש סמואל — Google Apps Script Backend
// Stack: Google Sheets כמסד נתונים, endpoint יחיד, ניתוב לפי action
// ============================================================
// התקנה:
//   1. החליפו את SHEET_ID למטה ב-ID של הגיליון שלכם
//      (המחרוזת הארוכה בין /d/ ל-/edit בכתובת הגיליון).
//   2. Deploy → New deployment → Web app
//        - Execute as: Me
//        - Who has access: Anyone
//   3. העתיקו את ה-URL ל-config.js → CONFIG.SCRIPT_URL.
//   4. ⚠ בכל עריכה של הקובץ צריך לפרוס מחדש:
//        Deploy → Manage deployments → ✏ edit → Version: New version → Deploy
// ============================================================

const SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';

// ============================================================
// HELPERS
// ============================================================
function getSpreadsheet() { return SpreadsheetApp.openById(SHEET_ID); }
function getSheet(name) { return getSpreadsheet().getSheetByName(name); }

function ensureSheet(name, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); }
  return sheet;
}

// זריעת נתוני התחלה אם הגיליון ריק (רק שורת כותרת)
function seedIfEmpty(sheet, rows) {
  if (sheet.getLastRow() <= 1 && rows && rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function isActive(v) { return v === 'כן' || v === true || v === 'yes'; }
function toBool(v) { return v === 'true' || v === true || v === 'כן' || v === 'yes'; }

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// קריאת גיליון כמערך אובייקטים לפי keys (סדר העמודות = הסכמה)
function getObjects(name, keys, seed) {
  const sheet = ensureSheet(name, keys);
  if (seed) seedIfEmpty(sheet, seed);
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const o = { _row: i + 1 };
    keys.forEach((k, idx) => o[k] = data[i][idx]);
    out.push(o);
  }
  return out;
}

// מציאת שורה לפי שתי עמודות (1-based) — או -1
function findRow2(sheet, c1, v1, c2, v2) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][c1]) === String(v1) && String(data[i][c2]) === String(v2)) return i + 1;
  }
  return -1;
}

function uid() { return Utilities.getUuid().substring(0, 8); }
function nowISO() { return new Date().toISOString(); }

// ============================================================
// SCHEMAS + SEED (הנתונים האמיתיים מקבוצת הוואטסאפ)
// ============================================================
const SETTINGS_H = ['key', 'value'];
const SETTINGS_SEED = [
  ['locationName', 'אבן מנחם'],
  ['locationNote', 'מושב בגליל העליון, אזור מעלות-תרשיחא'],
  ['wazeUrl', 'https://waze.com/ul?q=%D7%90%D7%91%D7%9F%20%D7%9E%D7%A0%D7%97%D7%9D&navigate=yes'],
  ['mapsUrl', 'https://www.google.com/maps/search/?api=1&query=%D7%90%D7%91%D7%9F%20%D7%9E%D7%A0%D7%97%D7%9D'],
  ['slogan', 'איזה יום היה לי סמואל'],
  ['year', '2026'],
  ['vacationStart', '26/07/2026 16:00'],  // ← עדכנו לתאריך האמיתי (dd/MM/yyyy HH:mm)
];

// Schema: id(0), name(1), family(2), avatar(3), pin(4), active(5), created(6)
const USERS_H = ['id', 'name', 'family', 'avatar', 'pin', 'active', 'created'];

// Schema: id(0), category(1), title(2), detail(3), day(4), needed(5), active(6)
const ASSIGN_H = ['id', 'category', 'title', 'detail', 'day', 'needed', 'active'];
const ASSIGN_SEED = [
  ['m1', 'ארוחה', 'ארוחת ערב', '', 'יום ראשון', 2, 'כן'],
  ['m2', 'ארוחה', 'ארוחת בוקר', '', 'יום שני', 2, 'כן'],
  ['m3', 'ארוחה', 'ארוחת צהריים', '', 'יום שני', 2, 'כן'],
  ['m4', 'ארוחה', 'ארוחת ערב', '', 'יום שני', 2, 'כן'],
  ['m5', 'ארוחה', 'ארוחת בוקר', '', 'יום שלישי', 2, 'כן'],
  ['m6', 'ארוחה', 'ארוחת צהריים', '', 'יום שלישי', 2, 'כן'],
  ['a1', 'פעילות', 'פעילות ערב ראשון', 'ערב פתיחה', 'יום ראשון', 1, 'כן'],
  ['a2', 'פעילות', 'פעילות ערב שני', '', 'יום שני', 1, 'כן'],
  ['a3', 'פעילות', 'פעילות אינטראקטיבית לנסיעות', 'משהו כיף לדרך', '', 1, 'כן'],
  ['a4', 'פעילות', 'הפתעות נוספות', 'מי מארגן?', '', 1, 'כן'],
  ['k1', 'כלי', 'מחבת חלבית', '', '', 1, 'כן'],
  ['k2', 'כלי', 'סיר חלבי', '', '', 1, 'כן'],
  ['k3', 'כלי', 'סיר בשרי', '', '', 1, 'כן'],
  ['k4', 'כלי', 'מחבת בשרי', '', '', 1, 'כן'],
  ['k5', 'כלי', 'כף ומזלג בשריים', 'ל-3 סועדים', '', 3, 'כן'],
  ['k6', 'כלי', 'כף ומזלג חלביים', 'ל-3 סועדים', '', 3, 'כן'],
  ['k7', 'כלי', 'שרוול כוסות חד״פ לשתייה חמה', '', '', 2, 'כן'],
  ['k8', 'כלי', 'שרוול כוסות חד״פ לשתייה קרה', '', '', 2, 'כן'],
  ['k9', 'כלי', '100 צלחות חד״פ גדולות', '', '', 2, 'כן'],
  ['k10', 'כלי', '100 צלחות חד״פ קטנות', '', '', 2, 'כן'],
  ['k11', 'כלי', '100 מרקיות', '', '', 2, 'כן'],
  ['k12', 'כלי', '100 קעריות קטנות', '', '', 2, 'כן'],
];

// Schema: id(0), assignmentId(1), userId(2), name(3), avatar(4), family(5), timestamp(6), active(7)
const CLAIMS_H = ['id', 'assignmentId', 'userId', 'name', 'avatar', 'family', 'timestamp', 'active'];

// Schema: id(0), item(1), qty(2), scope(3), note(4), category(5), active(6)
const PACKING_H = ['id', 'item', 'qty', 'scope', 'note', 'category', 'active'];
const PACKING_SEED = [
  ['p1', 'קרש חיתוך', '', 'כל משפחה מביאה', '', 'מטבח', 'כן'],
  ['p2', 'סכין חד', '', 'כל משפחה מביאה', '', 'מטבח', 'כן'],
  ['p3', 'קערה', '', 'כל משפחה מביאה', '', 'מטבח', 'כן'],
  ['p4', 'חטיפים ונשנושים', '', 'כללי', 'בשפע!', 'אוכל', 'כן'],
  ['p5', 'מטענים', '', 'כללי', '', 'אלקטרוניקה', 'כן'],
  ['p6', 'בוקסא (רמקול)', '', 'כללי', '', 'אלקטרוניקה', 'כן'],
  ['p7', 'גלגלים', '', 'כללי', 'אופניים / קורקינט / רולר', 'כיף', 'כן'],
  ['p8', 'החולצות משנה שעברה', '', 'כללי', '', 'ביגוד', 'כן'],
  ['p9', 'תבניות קרח', '', 'כללי', '', 'מטבח', 'כן'],
];

// Schema: id(0), day(1), order(2), time(3), title(4), type(5), detail(6), active(7)
const SCHED_H = ['id', 'day', 'order', 'time', 'title', 'type', 'detail', 'active'];
const SCHED_SEED = [
  ['s1', 'יום ראשון', 101, '16:00', 'הגעה וקליטה', 'other', 'מתמקמים ומתארגנים', 'כן'],
  ['s2', 'יום ראשון', 102, '19:00', 'ארוחת ערב משותפת', 'meal', '', 'כן'],
  ['s3', 'יום ראשון', 103, '21:00', 'פעילות פתיחה', 'activity', 'ערב ראשון מפתיע', 'כן'],
  ['s4', 'יום שני', 201, '08:30', 'ארוחת בוקר', 'meal', '', 'כן'],
  ['s5', 'יום שני', 202, '10:00', 'זמן חופשי / טיול', 'activity', '', 'כן'],
  ['s6', 'יום שני', 203, '13:00', 'ארוחת צהריים', 'meal', '', 'כן'],
  ['s7', 'יום שני', 204, '17:00', 'בריכה ומשחקים', 'activity', '', 'כן'],
  ['s8', 'יום שני', 205, '19:30', 'ארוחת ערב', 'meal', '', 'כן'],
  ['s9', 'יום שני', 206, '21:00', 'פעילות ערב', 'activity', '', 'כן'],
  ['s10', 'יום שלישי', 301, '08:30', 'ארוחת בוקר', 'meal', '', 'כן'],
  ['s11', 'יום שלישי', 302, '11:00', 'סיכום וקיפול', 'other', '', 'כן'],
  ['s12', 'יום שלישי', 303, '13:00', 'ארוחת צהריים קלה', 'meal', '', 'כן'],
  ['s13', 'יום שלישי', 304, '14:30', 'נסיעה הביתה', 'travel', 'פעילות אינטראקטיבית לדרך!', 'כן'],
];

// Schema: id(0), category(1), question(2), opt1(3), opt2(4), opt3(5), opt4(6), correct(7 · 1-based), active(8)
const QUIZ_H = ['id', 'category', 'question', 'opt1', 'opt2', 'opt3', 'opt4', 'correct', 'active'];
const QUIZ_SEED = [
  ['q1', 'מי אמר את זה?', 'מי כתב בקבוצה: "תביאו מלא חטיפים ונשנושים"?', 'נעומלה', 'הודיה', 'סבא', 'אמא', 1, 'כן'],
  ['q2', 'טריוויה', 'איפה מתקיים הנופש השנה?', 'אבן מנחם', 'ראש הנקרה', 'מצפה רמון', 'אילת', 1, 'כן'],
  ['q3', 'טריוויה', 'מה כל משפחה צריכה להביא בנוסף לציוד המשותף?', 'קרש חיתוך, סכין וקערה', 'מגבות', 'כיסאות', 'מקרר', 1, 'כן'],
  ['q4', 'מי אמר את זה?', 'מי הזכיר להביא "את החולצות משנה שעברה"?', 'נעומלה', 'הודיה', 'דוד', 'סבתא', 1, 'כן'],
  ['q5', 'טריוויה', 'כמה שרוולי כוסות חד״פ לשתייה חמה צריך להביא?', '2', '1', '5', '10', 1, 'כן'],
  ['q6', 'טריוויה', 'מה הסלוגן של הנופש?', 'איזה יום היה לי סמואל', 'סמואל בראש', 'נופש בלי סוף', 'קיץ שמח', 1, 'כן'],
  ['q7', 'טריוויה', 'באיזה אזור נמצאת אבן מנחם?', 'הגליל העליון', 'הנגב', 'השרון', 'הגולן', 1, 'כן'],
  ['q8', 'מי אמר את זה?', 'מי פירט את רשימת הכלים (סירים ומחבתות)?', 'הודיה', 'נעומלה', 'אבא', 'נכד', 1, 'כן'],
];

// Schema: id(0), userId(1), gameId(2), best(3), name(4), avatar(5), family(6), updated(7), active(8)
const SCORES_H = ['id', 'userId', 'gameId', 'best', 'name', 'avatar', 'family', 'updated', 'active'];

// Schema: id(0), userId(1), name(2), avatar(3), family(4), message(5), imageUrl(6), timestamp(7), active(8)
const POSTS_H = ['id', 'userId', 'name', 'avatar', 'family', 'message', 'imageUrl', 'timestamp', 'active'];

// ============================================================
// SETTINGS
// ============================================================
function getSettings() {
  try {
    const rows = getObjects('settings', SETTINGS_H, SETTINGS_SEED);
    const settings = {};
    rows.forEach(r => { if (r.key) settings[r.key] = r.value; });
    return { success: true, settings };
  } catch (e) { Logger.log('getSettings ' + e); return { success: false, message: e.toString(), settings: {} }; }
}

// ============================================================
// USERS
// ============================================================
function getUsers() {
  try {
    const users = getObjects('users', USERS_H).filter(u => isActive(u.active));
    const pts = computePoints().map;
    return {
      success: true,
      users: users.map(u => ({
        id: u.id, name: u.name, family: u.family, avatar: u.avatar,
        hasPin: !!String(u.pin || '').trim(), points: pts[u.id] || 0
      }))
    };
  } catch (e) { Logger.log('getUsers ' + e); return { success: false, message: e.toString(), users: [] }; }
}

function createUser(p) {
  try {
    if (!p.name || !String(p.name).trim()) return { success: false, message: 'חסר שם' };
    const sheet = ensureSheet('users', USERS_H);
    const id = uid();
    sheet.appendRow([id, String(p.name).trim(), p.family || '', p.avatar || '🙂', String(p.pin || '').trim(), 'כן', nowISO()]);
    return { success: true, user: { id, name: String(p.name).trim(), family: p.family || '', avatar: p.avatar || '🙂' } };
  } catch (e) { Logger.log('createUser ' + e); return { success: false, message: e.toString() }; }
}

function loginUser(id, pin) {
  try {
    const u = getObjects('users', USERS_H).find(x => String(x.id) === String(id) && isActive(x.active));
    if (!u) return { success: false, message: 'משתמש לא נמצא' };
    const stored = String(u.pin || '').trim();
    if (stored && stored !== String(pin || '').trim()) return { success: false, message: 'קוד שגוי' };
    return { success: true, user: { id: u.id, name: u.name, family: u.family, avatar: u.avatar } };
  } catch (e) { Logger.log('loginUser ' + e); return { success: false, message: e.toString() }; }
}

// ============================================================
// ASSIGNMENTS + CLAIMS
// ============================================================
function getAssignments() {
  try {
    const items = getObjects('assignments', ASSIGN_H, ASSIGN_SEED).filter(a => isActive(a.active));
    const claims = getObjects('claims', CLAIMS_H).filter(c => isActive(c.active));
    const byAssign = {};
    claims.forEach(c => { (byAssign[c.assignmentId] = byAssign[c.assignmentId] || []).push({ userId: c.userId, name: c.name, avatar: c.avatar, family: c.family }); });
    return {
      success: true,
      assignments: items.map(a => ({
        id: a.id, category: a.category, title: a.title, detail: a.detail,
        day: a.day, needed: parseInt(a.needed) || 1, claims: byAssign[a.id] || []
      }))
    };
  } catch (e) { Logger.log('getAssignments ' + e); return { success: false, message: e.toString(), assignments: [] }; }
}

function claimAssignment(p) {
  try {
    const sheet = ensureSheet('claims', CLAIMS_H);
    // שורה אחת לכל (משימה+משתמש) — אם קיימת, מפעילים/מרעננים; אחרת מוסיפים.
    const row = findRow2(sheet, 1, p.assignmentId, 2, p.userId);
    if (row !== -1) {
      sheet.getRange(row, 4).setValue(p.name || '');
      sheet.getRange(row, 5).setValue(p.avatar || '🙂');
      sheet.getRange(row, 6).setValue(p.family || '');
      sheet.getRange(row, 7).setValue(nowISO());
      sheet.getRange(row, 8).setValue('כן');
      return { success: true, message: 'נרשמת' };
    }
    sheet.appendRow([uid(), p.assignmentId, p.userId, p.name || '', p.avatar || '🙂', p.family || '', nowISO(), 'כן']);
    return { success: true, message: 'נרשמת' };
  } catch (e) { Logger.log('claimAssignment ' + e); return { success: false, message: e.toString() }; }
}

function unclaimAssignment(assignmentId, userId) {
  try {
    const sheet = getSheet('claims');
    if (!sheet) return { success: false, message: 'אין שיבוצים' };
    const row = findRow2(sheet, 1, assignmentId, 2, userId);
    if (row === -1) return { success: false, message: 'שיבוץ לא נמצא' };
    sheet.getRange(row, 8).setValue('לא'); // active → לא (מחיקה רכה)
    return { success: true, message: 'בוטל' };
  } catch (e) { Logger.log('unclaimAssignment ' + e); return { success: false, message: e.toString() }; }
}

// ============================================================
// PACKING
// ============================================================
function getPacking() {
  try {
    const rows = getObjects('packing', PACKING_H, PACKING_SEED).filter(i => isActive(i.active));
    return { success: true, packing: rows.map(i => ({ id: i.id, item: i.item, qty: i.qty, scope: i.scope, note: i.note, category: i.category })) };
  } catch (e) { Logger.log('getPacking ' + e); return { success: false, message: e.toString(), packing: [] }; }
}

// ============================================================
// SCHEDULE
// ============================================================
function getSchedule() {
  try {
    const rows = getObjects('schedule', SCHED_H, SCHED_SEED).filter(i => isActive(i.active));
    rows.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));
    return { success: true, schedule: rows.map(i => ({ day: i.day, time: i.time, title: i.title, type: i.type, detail: i.detail })) };
  } catch (e) { Logger.log('getSchedule ' + e); return { success: false, message: e.toString(), schedule: [] }; }
}

// ============================================================
// QUIZ
// ============================================================
function getQuiz() {
  try {
    const rows = getObjects('quiz', QUIZ_H, QUIZ_SEED).filter(q => isActive(q.active));
    return {
      success: true,
      quiz: rows.map(q => {
        const options = [q.opt1, q.opt2, q.opt3, q.opt4].filter(o => String(o).trim() !== '');
        return { id: q.id, category: q.category, question: q.question, options, correct: (parseInt(q.correct) || 1) - 1 };
      })
    };
  } catch (e) { Logger.log('getQuiz ' + e); return { success: false, message: e.toString(), quiz: [] }; }
}

// ============================================================
// SCORES + LEADERBOARD
// ============================================================
// מפת נקודות: לכל משתמש סכום ה-best על פני כל המשחקים
function computePoints() {
  const scores = getObjects('scores', SCORES_H).filter(s => isActive(s.active));
  const map = {}, meta = {};
  scores.forEach(s => {
    const uid = s.userId; const best = parseInt(s.best) || 0;
    map[uid] = (map[uid] || 0) + best;
    meta[uid] = { name: s.name, avatar: s.avatar, family: s.family }; // תמונת מצב אחרונה
  });
  return { map, meta };
}

function submitScore(p) {
  try {
    const sheet = ensureSheet('scores', SCORES_H);
    const score = parseInt(p.score) || 0;
    const row = findRow2(sheet, 1, p.userId, 2, p.gameId);
    let best = score, added = score, isBest = true;
    if (row === -1) {
      sheet.appendRow([uid(), p.userId, p.gameId, score, p.name || '', p.avatar || '🙂', p.family || '', nowISO(), 'כן']);
    } else {
      const oldBest = parseInt(sheet.getRange(row, 4).getValue()) || 0;
      if (score > oldBest) {
        sheet.getRange(row, 4).setValue(score);
        sheet.getRange(row, 5).setValue(p.name || '');
        sheet.getRange(row, 6).setValue(p.avatar || '🙂');
        sheet.getRange(row, 7).setValue(p.family || '');
        sheet.getRange(row, 8).setValue(nowISO());
        best = score; added = score - oldBest; isBest = true;
      } else { best = oldBest; added = 0; isBest = false; }
    }
    const totalPoints = computePoints().map[p.userId] || 0;
    return { success: true, best, added, isBest, totalPoints };
  } catch (e) { Logger.log('submitScore ' + e); return { success: false, message: e.toString() }; }
}

function getLeaderboard() {
  try {
    const { map, meta } = computePoints();
    const rows = Object.keys(map).map(uid => ({
      userId: uid, points: map[uid],
      name: (meta[uid] && meta[uid].name) || 'שחקן', avatar: (meta[uid] && meta[uid].avatar) || '🙂',
      family: (meta[uid] && meta[uid].family) || ''
    }));
    rows.sort((a, b) => b.points - a.points);
    return { success: true, leaderboard: rows };
  } catch (e) { Logger.log('getLeaderboard ' + e); return { success: false, message: e.toString(), leaderboard: [] }; }
}

// ============================================================
// WALL (POSTS)
// ============================================================
function getPosts() {
  try {
    const sheet = ensureSheet('posts', POSTS_H);
    if (sheet.getLastRow() <= 1) {
      sheet.appendRow([uid(), 'system', 'צוות הנופש', '🌅', '', 'ברוכים הבאים לקיר השיתוף! פה משתפים טיפים, קישורים לאלבומים ותמונות. שיהיה נופש מהמם 🎉', '', nowISO(), 'כן']);
    }
    const rows = getObjects('posts', POSTS_H).filter(p => isActive(p.active));
    rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { success: true, posts: rows.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, family: p.family, message: p.message, imageUrl: p.imageUrl, ts: p.timestamp })) };
  } catch (e) { Logger.log('getPosts ' + e); return { success: false, message: e.toString(), posts: [] }; }
}

function addPost(p) {
  try {
    if (!String(p.message || '').trim() && !String(p.imageUrl || '').trim()) return { success: false, message: 'הודעה ריקה' };
    const sheet = ensureSheet('posts', POSTS_H);
    sheet.appendRow([uid(), p.userId || '', p.name || 'אנונימי', p.avatar || '🙂', p.family || '', String(p.message || '').trim(), String(p.imageUrl || '').trim(), nowISO(), 'כן']);
    return { success: true, message: 'פורסם' };
  } catch (e) { Logger.log('addPost ' + e); return { success: false, message: e.toString() }; }
}

// ============================================================
// SUMMARY (לדף הבית)
// ============================================================
function getSummary(userId) {
  try {
    const items = getObjects('assignments', ASSIGN_H, ASSIGN_SEED).filter(a => isActive(a.active));
    const claims = getObjects('claims', CLAIMS_H).filter(c => isActive(c.active));
    const count = {};
    claims.forEach(c => count[c.assignmentId] = (count[c.assignmentId] || 0) + 1);
    let open = 0;
    items.forEach(a => { if ((count[a.id] || 0) < (parseInt(a.needed) || 1)) open++; });

    const posts = getObjects('posts', POSTS_H).filter(p => isActive(p.active));
    const { map, meta } = computePoints();
    const players = Object.keys(map).length;
    let topName = '';
    if (players) { const top = Object.keys(map).sort((a, b) => map[b] - map[a])[0]; topName = (meta[top] && meta[top].name) || ''; }

    return {
      success: true,
      summary: {
        openAssignments: open,
        totalAssignments: items.length,
        wallCount: posts.length,
        playerCount: players,
        myPoints: userId ? (map[userId] || 0) : 0
      }
    };
  } catch (e) { Logger.log('getSummary ' + e); return { success: false, message: e.toString() }; }
}

// ============================================================
// MAINTENANCE
// ============================================================
// טריגר זמן כל 10 דק' → keepWarm מונע cold-start (Triggers → Add Trigger)
function keepWarm() { Logger.log('keep-warm ' + new Date().toISOString()); }

// ============================================================
// HTTP ROUTER — endpoint יחיד, ניתוב לפי action
// ============================================================
function doGet(e) { return doPost(e); }
function doPost(e) {
  try {
    if (!e || !e.parameter) return jsonResponse({ success: false, message: 'No parameters' });
    const p = e.parameter;
    switch (p.action) {

      case 'ping': return jsonResponse({ success: true, version: 'samuel-v1' });

      // הגדרות + סיכום
      case 'getSettings': return jsonResponse(getSettings());
      case 'getSummary':  return jsonResponse(getSummary(p.userId));

      // משתמשים
      case 'getUsers':    return jsonResponse(getUsers());
      case 'createUser':  return jsonResponse(createUser({ name: p.name, family: p.family, avatar: p.avatar, pin: p.pin }));
      case 'loginUser':   return jsonResponse(loginUser(p.id, p.pin));

      // השתבצויות
      case 'getAssignments':   return jsonResponse(getAssignments());
      case 'claimAssignment':  return jsonResponse(claimAssignment({ assignmentId: p.assignmentId, userId: p.userId, name: p.name, avatar: p.avatar, family: p.family }));
      case 'unclaimAssignment':return jsonResponse(unclaimAssignment(p.assignmentId, p.userId));

      // מה להביא / לו״ז / חידון
      case 'getPacking':  return jsonResponse(getPacking());
      case 'getSchedule': return jsonResponse(getSchedule());
      case 'getQuiz':     return jsonResponse(getQuiz());

      // משחקים
      case 'submitScore':    return jsonResponse(submitScore({ userId: p.userId, gameId: p.gameId, score: p.score, name: p.name, avatar: p.avatar, family: p.family }));
      case 'getLeaderboard': return jsonResponse(getLeaderboard());

      // קיר
      case 'getPosts': return jsonResponse(getPosts());
      case 'addPost':  return jsonResponse(addPost({ userId: p.userId, name: p.name, avatar: p.avatar, family: p.family, message: p.message, imageUrl: p.imageUrl }));

      default: return jsonResponse({ success: false, message: 'Unknown action: ' + p.action });
    }
  } catch (e) { Logger.log('doPost ' + e); return jsonResponse({ success: false, message: e.toString() }); }
}
