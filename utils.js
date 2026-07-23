/**
 * utils.js — כלים משותפים
 * ליבה מתבנית sheets-platform (apiCall, theme, toast) + עוזרים לאתר.
 */

// ── קיצורים ────────────────────────────────────────────────
const $  = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── ערכת נושא (תואם data-theme, מכבד העדפת מערכת בביקור ראשון) ─
function initTheme() {
  let saved = localStorage.getItem('app-theme');
  if (!saved) {
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    saved = sysDark ? 'dark' : (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_THEME : 'light');
  }
  document.documentElement.dataset.theme = saved;
  updateThemeToggleIcon(saved);
}
function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('app-theme', next);
  updateThemeToggleIcon(next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0E1F1C' : '#EC5A45');
}
function updateThemeToggleIcon(theme) {
  const btn = $('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── מסך טעינה ──────────────────────────────────────────────
function updateLoadingProgress(text) { const el = $('loadingProgress'); if (el) el.textContent = text; }
function hideLoadingScreen(delay = 350) {
  setTimeout(() => {
    const screen = $('loadingScreen');
    const app = $('app');
    if (screen) screen.classList.add('hidden');
    if (app) app.classList.add('visible');
  }, delay);
}

// ── API ────────────────────────────────────────────────────
// חימום מוקדם (מונע cold-start של Apps Script בקריאה הראשונה)
function warmupServer() {
  if (typeof CONFIG === 'undefined' || !CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.includes('PASTE_')) return;
  fetch(CONFIG.SCRIPT_URL + '?action=ping').catch(() => {});
}

// הדרך היחידה לפנות ל-backend. תמיד GET עם URLSearchParams — CORS פשוט, בלי preflight.
async function apiCall(action, params = {}) {
  if (typeof CONFIG === 'undefined') throw new Error('CONFIG לא נטען');
  if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.includes('PASTE_')) {
    throw new Error('SCRIPT_URL לא הוגדר ב-config.js');
  }
  const url = CONFIG.SCRIPT_URL + '?' + new URLSearchParams({ action, ...params });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('שגיאת שרת: ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { success: true, raw: text }; }
}

// ── טוסט ───────────────────────────────────────────────────
(function initToastContainer() {
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    if (!$('toastContainer')) {
      const el = document.createElement('div');
      el.id = 'toastContainer'; el.className = 'toast-container';
      document.body.appendChild(el);
    }
  });
})();
function showToast(message, type = 'info', duration = 3200) {
  let c = $('toastContainer');
  if (!c) { c = document.createElement('div'); c.id = 'toastContainer'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${esc(message)}</span>`;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-show'));
  setTimeout(() => { t.classList.remove('toast-show'); t.classList.add('toast-hide'); setTimeout(() => t.remove(), 350); }, duration);
}
const showStatus = (m, t = 'info', d = 4000) => showToast(m, t, d);

// ── פורמט זמן ──────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts); if (isNaN(d)) return '';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'הרגע';
  const min = Math.floor(sec / 60); if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);  if (hr < 24) return `לפני ${hr} שע׳`;
  const day = Math.floor(hr / 24);  if (day < 7) return `לפני ${day} ימים`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

// ── קונפטי (Canvas, בלי קבצים חיצוניים) ────────────────────
function burstConfetti(count = 120) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('confetti'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const colors = ['#EC5A45','#EE9F1E','#147A6B','#FFBB47','#FF6E57','#1AA48F'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight / 3,
    vx: (Math.random() - 0.5) * 11,
    vy: Math.random() * -13 - 4,
    size: Math.random() * 8 + 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
    life: 1,
  }));
  let frame = 0;
  (function anim() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    parts.forEach(p => {
      p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
      if (p.life > 0 && p.y < innerHeight + 40) {
        alive = true;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); ctx.restore();
      }
    });
    frame++;
    if (alive && frame < 240) requestAnimationFrame(anim);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

// ── צליל קצר (Web Audio, בלי קבצים) ────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
    };
    play(660, 0, 0.15); play(880, 0.12, 0.18);
  } catch (e) {}
}
