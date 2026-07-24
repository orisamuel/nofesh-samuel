/**
 * config.js — הגדרות האתר
 * זה הקובץ היחיד שצריך לערוך אחרי הפריסה. נטען בכל האתר.
 */
const CONFIG = {

    // ── כתובת ה-Web App של Google Apps Script ────────────────
    // מדביקים כאן את ה-URL מ: עורך Apps Script → Deploy → Manage deployments
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyYBmY4t6NcH-COCvbzcSGzQBXJ_JSkqAAyJrZgFXcCzHetYdjeRcVI3b2wDH7dT3yjnA/exec',

    // ── קישור ישיר לגיליון (לכפתור "עריכה בגיליון") ──────────
    SHEETS_URL: 'https://docs.google.com/spreadsheets/d/1BBq7B_SEz6RkaIS9O1VwEhSggPYyYa2_VNbgpxwmcd8/edit',

    // ── זהות האתר ────────────────────────────────────────────
    APP_NAME:     'נופש סמואל',
    APP_SUBTITLE: 'איזה יום היה לי סמואל',
    APP_YEAR:     '2026',

    // ── תיקיית תמונות המשחק (יחסית לשורש האתר) ────────────────
    IMAGES_DIR: 'assets/mem',

    // תמונות משפחתיות למשחק הזיכרון (בתוך IMAGES_DIR).
    // אם ריק — המשחק משתמש באימוג'ים. להוספה: שמים קובץ ב-assets/mem ומוסיפים לרשימה.
    MEMORY_IMAGES: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg', '8.jpg'],

    // ── ברירות מחדל למיקום (נדרסות ע"י גיליון settings אם קיים) ─
    LOCATION_NAME: 'אבן מנחם',
    LOCATION_NOTE: 'מושב בגליל העליון, אזור מעלות',
    WAZE_URL:  'https://waze.com/ul?q=%D7%90%D7%91%D7%9F%20%D7%9E%D7%A0%D7%97%D7%9D&navigate=yes',
    MAPS_URL:  'https://www.google.com/maps/search/?api=1&query=%D7%90%D7%91%D7%9F%20%D7%9E%D7%A0%D7%97%D7%9D',

    // ── קישור לאלבום תמונות משותף (Google Photos וכו') ────────
    // אם ריק — כפתור האלבום בקיר מוסתר. הדביקו כאן קישור שיתוף לאלבום.
    GOOGLE_PHOTOS_URL: '',

    // ── אימוג'ים לבחירת אווטאר בפרופיל ───────────────────────
    AVATARS: ['🦁','🐻','🦊','🐼','🐸','🐙','🦄','🐝','🦋','🐢','🐬','🦩',
              '🌻','🍉','🌵','⭐','🔥','🍦','🏕️','🎸','🎨','⚽','🚀','👑'],

    // ── נקודות לפי פעולה במשחקים ──────────────────────────────
    POINTS: {
        triviaCorrect: 10,     // לכל תשובה נכונה בחידון
        triviaPerfect: 25,     // בונוס על חידון מושלם
        memoryBase:    40,     // בסיס לניצחון בזיכרון
        memoryTimeBonus: 60,   // בונוס מקסימלי לפי מהירות
    },

    // ── התנהגות ──────────────────────────────────────────────
    LEADERBOARD_REFRESH_MS: 20000,  // רענון טבלת מובילים
    DEFAULT_THEME: 'light',         // 'light' (יום/גלויה) או 'dark' (ערב/מדורה)
};
