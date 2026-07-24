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

const SHEET_ID = '1BBq7B_SEz6RkaIS9O1VwEhSggPYyYa2_VNbgpxwmcd8';

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

// מציאת שורה לפי id בעמודה הראשונה (0) — מחזיר אינדקס 1-based או -1
function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(id)) return i + 1;
  return -1;
}

function uid() { return Utilities.getUuid().substring(0, 8); }
function nowISO() { return new Date().toISOString(); }
function fmtDate(d) { return Utilities.formatDate(d, 'Asia/Jerusalem', 'dd/MM/yyyy'); }
function fmtTime(d) { return Utilities.formatDate(d, 'Asia/Jerusalem', 'HH:mm'); }

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

// Schema: id(0), name(1), family(2), avatar(3), pin(4), active(5), created(6), motto(7)
const USERS_H = ['id', 'name', 'family', 'avatar', 'pin', 'active', 'created', 'motto'];

// Schema: id(0), category(1), title(2), detail(3), day(4), needed(5), active(6)
const ASSIGN_H = ['id', 'category', 'title', 'detail', 'day', 'needed', 'active'];
const ASSIGN_SEED = [
  ['m1', 'ארוחה', 'ארוחת צהריים', '', 'יום שני', 2, 'כן'],
  ['m2', 'ארוחה', 'ארוחת ערב', '', 'יום שני', 2, 'כן'],
  ['m3', 'ארוחה', 'ארוחת בוקר', '', 'יום שלישי', 2, 'כן'],
  ['m4', 'ארוחה', 'ארוחת צהריים', '', 'יום שלישי', 2, 'כן'],
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
  ['s1', 'יום ראשון', 101, '11:00', 'מגיעים לכינרת', 'activity', 'נפגשים ומתחילים את הנופש', 'כן'],
  ['s2', 'יום ראשון', 102, '13:30', 'ארוחת צהריים', 'meal', '', 'כן'],
  ['s3', 'יום ראשון', 103, '15:00', 'הגעה לווילה', 'travel', '', 'כן'],
  ['s4', 'יום ראשון', 104, '15:30', 'השתבצות לחדרים', 'other', '', 'כן'],
  ['s5', 'יום ראשון', 105, '19:00', 'מנגל! 🔥', 'meal', '', 'כן'],
  ['s6', 'יום ראשון', 106, '21:00', 'תחרות המערכונים', 'activity', 'כל משפחה מכינה מערכון', 'כן'],
  ['s7', 'יום שני', 201, '09:00', 'ארוחת בוקר', 'meal', '', 'כן'],
  ['s8', 'יום שני', 202, '10:30', 'פעילויות', 'activity', 'ועוד הרבה כיף', 'כן'],
  ['s9', 'יום שלישי', 301, '09:00', 'ארוחת בוקר', 'meal', '', 'כן'],
  ['s10', 'יום שלישי', 302, '10:30', 'פעילויות', 'activity', '', 'כן'],
  ['s11', 'יום שלישי', 303, '13:00', 'חוזרים הביתה בכיף ובשמחה', 'travel', '', 'כן'],
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
  ['q9', 'טריוויה', 'מתי מתחיל נופש סמואל?', '26 ביולי', '1 באוגוסט', '15 ביולי', '19 ביולי', 1, 'כן'],
  ['q10', 'טריוויה', 'כמה ימים נמשך הנופש?', '3 ימים', 'יומיים', '4 ימים', 'שבוע', 1, 'כן'],
  ['q11', 'טריוויה', 'באילו ימים מתקיים הנופש?', 'ראשון–שלישי', 'חמישי–שבת', 'שני–רביעי', 'שישי–שבת', 1, 'כן'],
  ['q12', 'מי אמר את זה?', 'מי ביקש להביא "מטענים, בוקסא וגלגלים"?', 'נעומלה', 'הודיה', 'עמיחי', 'אמא', 1, 'כן'],
  ['q13', 'טריוויה', 'מה הפעילות המרכזית בערב הראשון?', 'תחרות המערכונים', 'קריוקי', 'משחקי מים', 'ערב סרטים', 1, 'כן'],
  ['q14', 'טריוויה', 'מה אוכלים בערב הראשון של הנופש?', 'מנגל 🔥', 'פיצה', 'סושי', 'פסטה', 1, 'כן'],
  ['q15', 'טריוויה', 'לאן מגיעים ביום הראשון בבוקר?', 'הכינרת', 'ים המלח', 'חוף הכרמל', 'אילת', 1, 'כן'],
  ['q16', 'טריוויה', 'כמה מרקיות צריך להביא סה״כ?', '100', '50', '200', '20', 1, 'כן'],
  ['q17', 'טריוויה', 'מה האימוג׳י הרשמי של הנופש?', '🌅', '❄️', '🎄', '🌧️', 1, 'כן'],
  ['q18', 'טריוויה', 'מה עושים בעמוד המשחקים?', 'צוברים נקודות', 'מצביעים', 'מעלים תמונות', 'קונים כרטיסים', 1, 'כן'],
  ['q19', 'טריוויה', 'מה הכי חשוב להביא לנופש?', 'מצב רוח טוב 😎', 'מגהץ', 'מטרייה', 'שעון מעורר', 1, 'כן'],
  ['q20', 'טריוויה', 'אבן מנחם נמצאת ליד איזו עיר?', 'מעלות-תרשיחא', 'טבריה', 'אשקלון', 'ירושלים', 1, 'כן'],
  ['q21', 'טריוויה', 'מה מתוכנן לערב יום שני?', 'פעילות ערב', 'חוזרים הביתה', 'מגיעים לכינרת', 'ארוחת בוקר', 1, 'כן'],
  ['q22', 'טריוויה', 'מתי חוזרים הביתה מהנופש?', 'יום שלישי', 'יום ראשון', 'יום שני', 'יום רביעי', 1, 'כן'],
];

// השלמת מאגר החידון: מוסיף כל שאלה מ-QUIZ_SEED שעדיין לא קיימת בגיליון (לפי id).
// להרצה ישירה מהעורך אחרי הוספת שאלות ל-QUIZ_SEED.
function addQuizQuestions() {
  const sheet = ensureSheet('quiz', QUIZ_H);
  const existing = {};
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) existing[String(data[i][0])] = true;
  const toAdd = QUIZ_SEED.filter(r => !existing[String(r[0])]);
  if (toAdd.length) sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, QUIZ_H.length).setValues(toAdd);
  Logger.log('added ' + toAdd.length + ' quiz questions');
  return toAdd.length;
}

// Schema: id(0), userId(1), gameId(2), best(3), name(4), avatar(5), family(6), updated(7), active(8)
const SCORES_H = ['id', 'userId', 'gameId', 'best', 'name', 'avatar', 'family', 'updated', 'active'];

// Schema: id(0), userId(1), name(2), avatar(3), family(4), message(5), imageUrl(6), timestamp(7), active(8)
const POSTS_H = ['id', 'userId', 'name', 'avatar', 'family', 'message', 'imageUrl', 'timestamp', 'active'];

// Schema: id(0), postId(1), userId(2), timestamp(3), active(4)
const LIKES_H = ['id', 'postId', 'userId', 'timestamp', 'active'];

// ============================================================
// SETTINGS
// ============================================================
function getSettings() {
  try {
    const rows = getObjects('settings', SETTINGS_H, SETTINGS_SEED);
    const settings = {};
    rows.forEach(r => {
      if (!r.key) return;
      settings[r.key] = (r.value instanceof Date) ? Utilities.formatDate(r.value, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm') : r.value;
    });
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
        motto: u.motto || '', hasPin: !!String(u.pin || '').trim(), points: pts[u.id] || 0
      }))
    };
  } catch (e) { Logger.log('getUsers ' + e); return { success: false, message: e.toString(), users: [] }; }
}

function createUser(p) {
  try {
    if (!p.name || !String(p.name).trim()) return { success: false, message: 'חסר שם' };
    const sheet = ensureSheet('users', USERS_H);
    ensureUsersMottoHeader(sheet);
    const id = uid();
    const motto = String(p.motto || '').trim();
    sheet.appendRow([id, String(p.name).trim(), p.family || '', p.avatar || '🙂', String(p.pin || '').trim(), 'כן', nowISO(), motto]);
    return { success: true, user: { id, name: String(p.name).trim(), family: p.family || '', avatar: p.avatar || '🙂', motto: motto } };
  } catch (e) { Logger.log('createUser ' + e); return { success: false, message: e.toString() }; }
}

function loginUser(id, pin) {
  try {
    const u = getObjects('users', USERS_H).find(x => String(x.id) === String(id) && isActive(x.active));
    if (!u) return { success: false, message: 'משתמש לא נמצא' };
    const stored = String(u.pin || '').trim();
    if (stored && stored !== String(pin || '').trim()) return { success: false, message: 'קוד שגוי' };
    return { success: true, user: { id: u.id, name: u.name, family: u.family, avatar: u.avatar, motto: u.motto || '' } };
  } catch (e) { Logger.log('loginUser ' + e); return { success: false, message: e.toString() }; }
}

// כותרת עמודת motto (העמודה השמינית) — נוצרת פעם אחת אם חסרה
function ensureUsersMottoHeader(sheet) {
  try { if (!sheet.getRange(1, 8).getValue()) sheet.getRange(1, 8).setValue('motto'); } catch (e) {}
}

// עדכון פרופיל: שם / אווטאר / מוטו / משפחה + הפצה לשמות המשוכפלים (scores/claims/posts)
function updateUser(p) {
  try {
    if (!p.id) return { success: false, message: 'חסר מזהה' };
    const sheet = getSheet('users'); if (!sheet) return { success: false, message: 'אין משתמשים' };
    ensureUsersMottoHeader(sheet);
    const row = findRowById(sheet, p.id); if (row === -1) return { success: false, message: 'משתמש לא נמצא' };
    const name   = (p.name   !== undefined) ? String(p.name).trim()   : null;
    const family = (p.family !== undefined) ? String(p.family).trim() : null;
    const avatar = (p.avatar !== undefined) ? String(p.avatar).trim() : null;
    const motto  = (p.motto  !== undefined) ? String(p.motto).trim()  : null;
    if (name !== null) { if (!name) return { success: false, message: 'צריך שם' }; sheet.getRange(row, 2).setValue(name); }
    if (family !== null) sheet.getRange(row, 3).setValue(family);
    if (avatar !== null) sheet.getRange(row, 4).setValue(avatar || '🙂');
    if (motto  !== null) sheet.getRange(row, 8).setValue(motto);
    cascadeUserDisplay(p.id, name, avatar, family);
    const u = getObjects('users', USERS_H).find(x => String(x.id) === String(p.id));
    return { success: true, user: { id: u.id, name: u.name, family: u.family, avatar: u.avatar, motto: u.motto || '' } };
  } catch (e) { Logger.log('updateUser ' + e); return { success: false, message: e.toString() }; }
}

// עדכון השם/אווטאר/משפחה המשוכפלים בכל הגיליונות שמחזיקים עותק (לוח מובילים, שיבוצים, קיר)
function cascadeUserDisplay(id, name, avatar, family) {
  const apply = (sheetName, userCol, nameCol, avCol, famCol) => {
    const sh = getSheet(sheetName); if (!sh) return;
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][userCol]) !== String(id)) continue;
      if (name   != null) sh.getRange(i + 1, nameCol + 1).setValue(name);
      if (avatar != null) sh.getRange(i + 1, avCol + 1).setValue(avatar || '🙂');
      if (famCol != null && family != null) sh.getRange(i + 1, famCol + 1).setValue(family);
    }
  };
  apply('scores', 1, 4, 5, 6); // userId(1) name(4) avatar(5) family(6)
  apply('claims', 2, 3, 4, 5); // userId(2) name(3) avatar(4) family(5)
  apply('posts',  1, 2, 3, 4); // userId(1) name(2) avatar(3) family(4)
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
const DAY_RANK = { 'יום ראשון': 1, 'יום שני': 2, 'יום שלישי': 3, 'יום רביעי': 4, 'יום חמישי': 5, 'יום שישי': 6, 'שבת': 7 };
function timeToMin(t) { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1] * 60 + +m[2]) : 9999; }

function getSchedule() {
  try {
    const rows = getObjects('schedule', SCHED_H, SCHED_SEED).filter(i => isActive(i.active));
    const mapped = rows.map(i => ({
      id: i.id, day: i.day,
      time: (i.time instanceof Date) ? fmtTime(i.time) : String(i.time || ''),
      title: i.title, type: i.type, detail: i.detail
    }));
    mapped.sort((a, b) => {
      const dr = (DAY_RANK[a.day] || 99) - (DAY_RANK[b.day] || 99);
      return dr !== 0 ? dr : timeToMin(a.time) - timeToMin(b.time);
    });
    return { success: true, schedule: mapped };
  } catch (e) { Logger.log('getSchedule ' + e); return { success: false, message: e.toString(), schedule: [] }; }
}

// כל אחד יכול להוסיף/לערוך/למחוק בלוקים בלו״ז מתוך האתר
function addSchedule(p) {
  try {
    const sheet = ensureSheet('schedule', SCHED_H);
    const id = uid();
    sheet.appendRow([id, p.day || '', 999, p.time || '', p.title || '', p.type || 'other', p.detail || '', 'כן']);
    return { success: true, id: id };
  } catch (e) { Logger.log('addSchedule ' + e); return { success: false, message: e.toString() }; }
}
function updateSchedule(p) {
  try {
    const sheet = getSheet('schedule'); if (!sheet) return { success: false, message: 'אין לו״ז' };
    const row = findRowById(sheet, p.id); if (row === -1) return { success: false, message: 'האירוע לא נמצא' };
    if (p.day    !== undefined) sheet.getRange(row, 2).setValue(p.day);
    if (p.time   !== undefined) sheet.getRange(row, 4).setValue(p.time);
    if (p.title  !== undefined) sheet.getRange(row, 5).setValue(p.title);
    if (p.type   !== undefined) sheet.getRange(row, 6).setValue(p.type);
    if (p.detail !== undefined) sheet.getRange(row, 7).setValue(p.detail);
    return { success: true };
  } catch (e) { Logger.log('updateSchedule ' + e); return { success: false, message: e.toString() }; }
}
function deleteSchedule(id) {
  try {
    const sheet = getSheet('schedule'); if (!sheet) return { success: false, message: 'אין לו״ז' };
    const row = findRowById(sheet, id); if (row === -1) return { success: false, message: 'האירוע לא נמצא' };
    sheet.getRange(row, 8).setValue('לא');
    return { success: true };
  } catch (e) { Logger.log('deleteSchedule ' + e); return { success: false, message: e.toString() }; }
}
// איפוס חד-פעמי של הלו״ז לתוכן ההתחלתי (מוגן בטוקן)
function resetSchedule(token) {
  try {
    if (token !== 'samuel-2026') return { success: false, message: 'unauthorized' };
    const sh = ensureSheet('schedule', SCHED_H);
    const last = sh.getLastRow();
    if (last > 1) sh.deleteRows(2, last - 1);
    seedIfEmpty(sh, SCHED_SEED);
    return { success: true, rows: sh.getLastRow() };
  } catch (e) { Logger.log('resetSchedule ' + e); return { success: false, message: e.toString() }; }
}

// ── מילוי השתבצויות לפי סקר הוואטסאפ (חד-פעמי, מוגן בטוקן) ──
const POLL_USERS = [
  ['חננאלי', '🦁'], ['ינוני', '🦊'], ['תהילה סמואל', '🐻'], ['הודיה היקרה', '🌻'],
  ['רנינוש', '🐙'], ['עמיחי', '🦄'], ['אמונהלי', '🐸'], ['רוניק היפה', '🦋'], ['רותם סמואל', '🐬']
];
const POLL_CLAIMS = [
  ['m1', ['הודיה היקרה']],                          // ארוחת צהריים · יום שני
  ['m2', ['אמונהלי']],                              // ארוחת ערב · יום שני
  ['m3', ['רותם סמואל', 'רוניק היפה']],             // ארוחת בוקר · יום שלישי
  ['k1', ['הודיה היקרה', 'עמיחי', 'אמונהלי']],       // מחבת חלבית
  ['k2', ['הודיה היקרה']],                          // סיר חלבי
  ['k3', ['הודיה היקרה', 'רוניק היפה']],            // סיר בשרי
  ['k4', ['רנינוש']],                               // מחבת בשרי
  ['k5', ['רנינוש', 'אמונהלי', 'רוניק היפה']],       // כף ומזלג בשריים
  ['k6', ['תהילה סמואל', 'אמונהלי', 'רוניק היפה']],  // כף ומזלג חלביים
  ['k7', ['עמיחי', 'אמונהלי']],                      // כוסות חמה
  ['k8', ['ינוני', 'עמיחי']],                        // כוסות קרה
  ['k9', ['הודיה היקרה', 'עמיחי']],                  // צלחות גדולות
  ['k10', ['תהילה סמואל']],                          // צלחות קטנות
  ['k11', ['חננאלי', 'ינוני']],                      // מרקיות
  ['k12', ['חננאלי', 'תהילה סמואל']],                // קעריות קטנות
];

function getOrCreateUserByName(name, avatar) {
  const sheet = ensureSheet('users', USERS_H);
  const found = getObjects('users', USERS_H).find(u => String(u.name).trim() === String(name).trim() && isActive(u.active));
  if (found) return found.id;
  const id = uid();
  sheet.appendRow([id, name, '', avatar || '🙂', '', 'כן', nowISO()]);
  return id;
}

function resetPoll(token) {
  try {
    if (token !== 'samuel-2026') return { success: false, message: 'unauthorized' };
    // איפוס assignments לרשימה המעודכנת
    const aSheet = ensureSheet('assignments', ASSIGN_H);
    let last = aSheet.getLastRow();
    if (last > 1) aSheet.deleteRows(2, last - 1);
    seedIfEmpty(aSheet, ASSIGN_SEED);
    // איפוס claims
    const cSheet = ensureSheet('claims', CLAIMS_H);
    last = cSheet.getLastRow();
    if (last > 1) cSheet.deleteRows(2, last - 1);
    // יצירת/איתור משתמשים
    const nameToId = {}, nameToAv = {};
    POLL_USERS.forEach(u => { nameToId[u[0]] = getOrCreateUserByName(u[0], u[1]); nameToAv[u[0]] = u[1]; });
    // כתיבת ההשתבצויות
    const rows = [];
    POLL_CLAIMS.forEach(function (pc) {
      pc[1].forEach(function (nm) {
        const uidv = nameToId[nm] || getOrCreateUserByName(nm, '🙂');
        rows.push([uid(), pc[0], uidv, nm, nameToAv[nm] || '🙂', '', nowISO(), 'כן']);
      });
    });
    if (rows.length) cSheet.getRange(cSheet.getLastRow() + 1, 1, rows.length, CLAIMS_H.length).setValues(rows);
    return { success: true, users: POLL_USERS.length, claims: rows.length };
  } catch (e) { Logger.log('resetPoll ' + e); return { success: false, message: e.toString() }; }
}

// ניקוי שורות ניקוד של פרופילים מקומיים (local-) — להרצה ישירה מהעורך
function cleanupLocalScores() {
  const sheet = getSheet('scores');
  if (!sheet) return 'no scores sheet';
  const data = sheet.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).indexOf('local-') === 0 && data[i][8] !== 'לא') {
      sheet.getRange(i + 1, 9).setValue('לא'); n++;
    }
  }
  Logger.log('deactivated ' + n + ' local score rows');
  return n;
}

// ── מיזוג כפילויות: מעביר הכל מ-loser ל-winner בלי לאבד נתונים, ומשבית את loser ──
// (להרצה ישירה מהעורך דרך runMerges)
function mergeUsers(loserId, winnerId) {
  const uSheet = getSheet('users');
  if (!uSheet) return 'no users sheet';
  const uData = uSheet.getDataRange().getValues();
  let loserRow = -1, winnerRow = -1;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(loserId)) loserRow = i + 1;
    if (String(uData[i][0]) === String(winnerId)) winnerRow = i + 1;
  }
  if (loserRow === -1 || winnerRow === -1) return 'skip: ' + loserId + '→' + winnerId + ' (loserRow=' + loserRow + ' winnerRow=' + winnerRow + ')';
  const wName = uData[winnerRow - 1][1], wAvatar = uData[winnerRow - 1][3] || '🙂', wFamily = uData[winnerRow - 1][2] || '';

  // 1) scores — עמודה: id(0) userId(1) gameId(2) best(3) name(4) avatar(5) family(6) updated(7) active(8)
  const scSheet = getSheet('scores');
  if (scSheet) {
    const d = scSheet.getDataRange().getValues();
    const wByGame = {};
    for (let i = 1; i < d.length; i++) if (String(d[i][1]) === String(winnerId) && d[i][8] !== 'לא') wByGame[String(d[i][2])] = { row: i + 1, best: parseInt(d[i][3]) || 0 };
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][1]) !== String(loserId) || d[i][8] === 'לא') continue;
      const g = String(d[i][2]), lb = parseInt(d[i][3]) || 0;
      if (wByGame[g]) { if (lb > wByGame[g].best) scSheet.getRange(wByGame[g].row, 4).setValue(lb); scSheet.getRange(i + 1, 9).setValue('לא'); }
      else { scSheet.getRange(i + 1, 2).setValue(winnerId); scSheet.getRange(i + 1, 5).setValue(wName); scSheet.getRange(i + 1, 6).setValue(wAvatar); scSheet.getRange(i + 1, 7).setValue(wFamily); wByGame[g] = { row: i + 1, best: lb }; }
    }
  }

  // 2) claims — עמודה: id(0) assignmentId(1) userId(2) name(3) avatar(4) family(5) ts(6) active(7)
  const clSheet = getSheet('claims');
  if (clSheet) {
    const d = clSheet.getDataRange().getValues();
    const wByAssign = {};
    for (let i = 1; i < d.length; i++) if (String(d[i][2]) === String(winnerId) && d[i][7] !== 'לא') wByAssign[String(d[i][1])] = true;
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][2]) !== String(loserId) || d[i][7] === 'לא') continue;
      const a = String(d[i][1]);
      if (wByAssign[a]) { clSheet.getRange(i + 1, 8).setValue('לא'); }
      else { clSheet.getRange(i + 1, 3).setValue(winnerId); clSheet.getRange(i + 1, 4).setValue(wName); clSheet.getRange(i + 1, 5).setValue(wAvatar); clSheet.getRange(i + 1, 6).setValue(wFamily); wByAssign[a] = true; }
    }
  }

  // 3) posts — עמודה: id(0) userId(1) name(2) avatar(3) family(4) ...
  const poSheet = getSheet('posts');
  if (poSheet) {
    const d = poSheet.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) if (String(d[i][1]) === String(loserId)) { poSheet.getRange(i + 1, 2).setValue(winnerId); poSheet.getRange(i + 1, 3).setValue(wName); poSheet.getRange(i + 1, 4).setValue(wAvatar); poSheet.getRange(i + 1, 5).setValue(wFamily); }
  }

  // 4) השלמת pin/משפחה ל-winner אם חסרים, ואז השבתת loser
  const wPin = String(uData[winnerRow - 1][4] || '').trim(), lPin = String(uData[loserRow - 1][4] || '').trim();
  if (!wPin && lPin) uSheet.getRange(winnerRow, 5).setValue(lPin);
  if (!String(wFamily).trim() && String(uData[loserRow - 1][2] || '').trim()) uSheet.getRange(winnerRow, 3).setValue(uData[loserRow - 1][2]);
  uSheet.getRange(loserRow, 6).setValue('לא'); // active → לא
  return 'merged ' + loserId + ' → ' + winnerId + ' (' + wName + ')';
}

// שלושת המיזוגים שזוהו (loser → winner). Winner = הפרופיל האמיתי עם הנקודות/PIN/שם-משפחה.
function runMerges() {
  const out = [];
  out.push(mergeUsers('415df4ee', '230ca050')); // אמונהלי → אמונה שחור
  out.push(mergeUsers('ca506f2c', '9d70cf63')); // חננאלי → חננאל סמואל
  out.push(mergeUsers('d629d325', '3be39565')); // רנינוש → רני אדלשטיין
  Logger.log(out.join('\n'));
  return out;
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
function getPosts(userId) {
  try {
    const sheet = ensureSheet('posts', POSTS_H);
    if (sheet.getLastRow() <= 1) {
      sheet.appendRow([uid(), 'system', 'צוות הנופש', '🌅', '', 'ברוכים הבאים לקיר השיתוף! פה משתפים טיפים, קישורים לאלבומים ותמונות. שיהיה נופש מהמם 🎉', '', nowISO(), 'כן']);
    }
    const rows = getObjects('posts', POSTS_H).filter(p => isActive(p.active));
    rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    // מפת לייקים: postId → {count, mine}
    const likes = getObjects('likes', LIKES_H).filter(l => isActive(l.active));
    const cnt = {}, mine = {};
    likes.forEach(l => { cnt[l.postId] = (cnt[l.postId] || 0) + 1; if (userId && String(l.userId) === String(userId)) mine[l.postId] = true; });
    return { success: true, posts: rows.map(p => ({ id: p.id, userId: p.userId, name: p.name, avatar: p.avatar, family: p.family, message: p.message, imageUrl: p.imageUrl, ts: p.timestamp, likes: cnt[p.id] || 0, likedByMe: !!mine[p.id] })) };
  } catch (e) { Logger.log('getPosts ' + e); return { success: false, message: e.toString(), posts: [] }; }
}

function addPost(p) {
  try {
    if (!String(p.message || '').trim() && !String(p.imageUrl || '').trim()) return { success: false, message: 'הודעה ריקה' };
    const sheet = ensureSheet('posts', POSTS_H);
    const id = uid();
    sheet.appendRow([id, p.userId || '', p.name || 'אנונימי', p.avatar || '🙂', p.family || '', String(p.message || '').trim(), String(p.imageUrl || '').trim(), nowISO(), 'כן']);
    return { success: true, message: 'פורסם', id: id };
  } catch (e) { Logger.log('addPost ' + e); return { success: false, message: e.toString() }; }
}

// לייק/ביטול-לייק לפוסט (טוגל, שורה אחת לכל משתמש+פוסט)
function likePost(p) {
  try {
    if (!p.postId || !p.userId) return { success: false, message: 'חסרים פרטים' };
    const sheet = ensureSheet('likes', LIKES_H);
    const row = findRow2(sheet, 1, p.postId, 2, p.userId);
    let liked;
    if (row === -1) { sheet.appendRow([uid(), p.postId, p.userId, nowISO(), 'כן']); liked = true; }
    else {
      const cur = sheet.getRange(row, 5).getValue();
      liked = !(cur === 'כן' || cur === true);
      sheet.getRange(row, 5).setValue(liked ? 'כן' : 'לא');
      if (liked) sheet.getRange(row, 4).setValue(nowISO());
    }
    // ספירה מעודכנת
    const likes = getObjects('likes', LIKES_H).filter(l => isActive(l.active) && String(l.postId) === String(p.postId));
    return { success: true, liked: liked, count: likes.length };
  } catch (e) { Logger.log('likePost ' + e); return { success: false, message: e.toString() }; }
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
      case 'createUser':  return jsonResponse(createUser({ name: p.name, family: p.family, avatar: p.avatar, pin: p.pin, motto: p.motto }));
      case 'updateUser':  return jsonResponse(updateUser({ id: p.id, name: p.name, family: p.family, avatar: p.avatar, motto: p.motto }));
      case 'loginUser':   return jsonResponse(loginUser(p.id, p.pin));

      // השתבצויות
      case 'getAssignments':   return jsonResponse(getAssignments());
      case 'claimAssignment':  return jsonResponse(claimAssignment({ assignmentId: p.assignmentId, userId: p.userId, name: p.name, avatar: p.avatar, family: p.family }));
      case 'unclaimAssignment':return jsonResponse(unclaimAssignment(p.assignmentId, p.userId));

      // מה להביא / לו״ז / חידון
      case 'getPacking':  return jsonResponse(getPacking());
      case 'getSchedule': return jsonResponse(getSchedule());
      case 'addSchedule':    return jsonResponse(addSchedule({ day: p.day, time: p.time, title: p.title, type: p.type, detail: p.detail }));
      case 'updateSchedule': return jsonResponse(updateSchedule({ id: p.id, day: p.day, time: p.time, title: p.title, type: p.type, detail: p.detail }));
      case 'deleteSchedule': return jsonResponse(deleteSchedule(p.id));
      case 'resetSchedule':  return jsonResponse(resetSchedule(p.token));
      case 'resetPoll':      return jsonResponse(resetPoll(p.token));
      case 'runMerges':      return jsonResponse(p.token === 'samuel-2026' ? { success: true, result: runMerges() } : { success: false, message: 'unauthorized' });
      case 'mergeUsers':     return jsonResponse(p.token === 'samuel-2026' ? { success: true, result: mergeUsers(p.loserId, p.winnerId) } : { success: false, message: 'unauthorized' });
      case 'addQuiz':        return jsonResponse(p.token === 'samuel-2026' ? { success: true, added: addQuizQuestions() } : { success: false, message: 'unauthorized' });
      case 'getQuiz':     return jsonResponse(getQuiz());

      // משחקים
      case 'submitScore':    return jsonResponse(submitScore({ userId: p.userId, gameId: p.gameId, score: p.score, name: p.name, avatar: p.avatar, family: p.family }));
      case 'getLeaderboard': return jsonResponse(getLeaderboard());

      // קיר
      case 'getPosts': return jsonResponse(getPosts(p.userId));
      case 'addPost':  return jsonResponse(addPost({ userId: p.userId, name: p.name, avatar: p.avatar, family: p.family, message: p.message, imageUrl: p.imageUrl }));
      case 'likePost': return jsonResponse(likePost({ postId: p.postId, userId: p.userId }));

      default: return jsonResponse({ success: false, message: 'Unknown action: ' + p.action });
    }
  } catch (e) { Logger.log('doPost ' + e); return jsonResponse({ success: false, message: e.toString() }); }
}
