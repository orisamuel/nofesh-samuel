/**
 * games.js — משחקונים משפחתיים + נקודות + טבלת מובילים
 */

const Games = {
  inGame: false,
  MEM_EMOJI: ['🌞','🍉','🏕️','🐬','🍦','🎸','⚽','🌵','🦋','🚗','🎨','🪁','🏖️','🔥','🐝','⭐'],

  // ── מסך משחקים ראשי ──
  home() {
    this.inGame = false;
    const catalog = [
      { id: 'memory', ic: '🧠', name: 'זיכרון משפחתי', desc: 'מצאו את כל הזוגות כמה שיותר מהר.', fn: 'Games.playMemory()' },
      { id: 'trivia', ic: '❓', name: 'חידון הנופש', desc: '"מי אמר את זה?" וטריוויה משפחתית.', fn: 'Games.playTrivia()' },
    ];
    const bests = this.bests || {};
    $('gamesHome').innerHTML = `
      ${!CONFIGURED ? App.notConfiguredBanner() : ''}
      <div class="game-grid">
        ${catalog.map(g => `
          <button class="game-card" onclick="${g.fn}">
            <div class="game-ic">${g.ic}</div>
            <div class="game-name">${esc(g.name)}</div>
            <div class="game-desc">${esc(g.desc)}</div>
            ${bests[g.id] ? `<div class="game-best">🏆 השיא שלך: ${bests[g.id]}</div>` : ''}
          </button>`).join('')}
      </div>
      <div class="card mt-lg">
        <div class="row between mb-md">
          <h3 style="font-family:var(--font-display);font-size:1.4rem;">🏆 טבלת המובילים</h3>
          <button class="icon-btn" onclick="Games.refreshLeaderboard()" title="רענון">🔄</button>
        </div>
        <div id="lbList"><div class="center"><div class="spinner-sm" style="margin:16px auto;"></div></div></div>
      </div>`;
    this.refreshLeaderboard();
  },

  // ── טבלת מובילים ──
  async refreshLeaderboard() {
    if (this.inGame) return;
    const box = $('lbList'); if (!box) return;
    if (!CONFIGURED) { box.innerHTML = emptyState('🏆', 'הטבלה תופיע כאן', 'זמין אחרי חיבור הגיליון'); return; }
    try {
      // מפת מוטו לפי משתמש (מ-getUsers) — לצירוף לטבלה
      let mottoMap = {};
      try {
        let users = App.state.users;
        if (!users) { const ur = await apiCall('getUsers'); users = (ur.success && ur.users) ? ur.users : []; App.state.users = users; }
        users.forEach(u => { if (u.motto) mottoMap[u.id] = u.motto; });
      } catch (e) {}
      const res = await apiCall('getLeaderboard');
      const rows = (res.success && res.leaderboard) ? res.leaderboard : [];
      const me = Profile.get();
      if (me) { const mine = rows.find(r => r.userId === me.id); if (mine) { Profile.setPoints(mine.points); } }
      if (!rows.length) { box.innerHTML = emptyState('🎮', 'עדיין אין תוצאות', 'שחקו כדי לפתוח את הטבלה!'); return; }
      const medal = ['🥇', '🥈', '🥉'];
      box.innerHTML = rows.map((r, i) => {
        const sub = mottoMap[r.userId] ? '״' + mottoMap[r.userId] + '״' : (r.family || '');
        return `
        <div class="lb-row ${me && r.userId === me.id ? 'me' : ''} ${i < 3 ? 'top' + (i + 1) : ''}">
          <span class="lb-rank">${i < 3 ? medal[i] : (i + 1)}</span>
          <span class="avatar">${r.avatar || '🙂'}</span>
          <span class="lb-name">${esc(r.name)}<div class="lb-fam">${esc(sub)}</div></span>
          <span class="lb-points">⭐ ${r.points}</span>
        </div>`; }).join('');
    } catch (e) { box.innerHTML = emptyState('😕', 'שגיאה', e.message); }
  },

  backBtn() {
    return `<button class="btn btn-ghost btn-sm mb-md" onclick="Games.home()">→ חזרה למשחקים</button>`;
  },

  // ═══ משחק זיכרון ═══
  playMemory() {
    if (!Profile.requireUser()) return;
    this.inGame = true;
    const imgs = (typeof CONFIG.MEMORY_IMAGES !== 'undefined' && CONFIG.MEMORY_IMAGES.length) ? CONFIG.MEMORY_IMAGES : null;
    const PAIRS = 6;
    let faces;
    if (imgs && imgs.length >= PAIRS) {
      faces = shuffle(imgs.slice()).slice(0, PAIRS).map(src => ({ type: 'img', val: CONFIG.IMAGES_DIR + '/' + src }));
    } else {
      faces = shuffle(this.MEM_EMOJI.slice()).slice(0, PAIRS).map(e => ({ type: 'emoji', val: e }));
    }
    const deck = shuffle([...faces, ...faces].map((f, i) => ({ ...f, key: i })));
    const M = { flipped: [], matched: 0, moves: 0, start: Date.now(), lock: false };

    const faceHtml = (f) => f.type === 'img' ? `<img src="${esc(f.val)}" alt="" onerror="this.parentElement.textContent='🖼️'">` : f.val;
    $('gamesHome').innerHTML = `
      ${this.backBtn()}
      <div class="card">
        <div class="game-stats">
          <div class="game-stat"><div class="gs-num" id="memMoves">0</div><div class="gs-label">מהלכים</div></div>
          <div class="game-stat"><div class="gs-num" id="memTime">0</div><div class="gs-label">שניות</div></div>
          <div class="game-stat"><div class="gs-num" id="memPairs">0/${PAIRS}</div><div class="gs-label">זוגות</div></div>
        </div>
        <div class="memory-board" id="memBoard" style="grid-template-columns:repeat(4,1fr);">
          ${deck.map(c => `
            <div class="mem-card" data-key="${c.key}" data-val="${esc(c.type + ':' + c.val)}" onclick="Games._memFlip(this)">
              <div class="mem-face mem-front">🌅</div>
              <div class="mem-face mem-back">${faceHtml(c)}</div>
            </div>`).join('')}
        </div>
      </div>`;

    this._mem = M;
    this._memTimer = setInterval(() => { if ($('memTime')) $('memTime').textContent = Math.floor((Date.now() - M.start) / 1000); }, 1000);
    this._memPairs = PAIRS;
  },

  _memFlip(card) {
    const M = this._mem; if (!M || M.lock) return;
    if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
    card.classList.add('flipped');
    M.flipped.push(card);
    if (M.flipped.length === 2) {
      M.moves++; $('memMoves').textContent = M.moves; M.lock = true;
      const [a, b] = M.flipped;
      if (a.dataset.val === b.dataset.val) {
        setTimeout(() => {
          a.classList.add('matched'); b.classList.add('matched');
          M.matched++; $('memPairs').textContent = `${M.matched}/${this._memPairs}`;
          M.flipped = []; M.lock = false;
          if (M.matched === this._memPairs) this._memWin();
        }, 340);
      } else {
        setTimeout(() => { a.classList.remove('flipped'); b.classList.remove('flipped'); M.flipped = []; M.lock = false; }, 850);
      }
    }
  },

  _memWin() {
    clearInterval(this._memTimer);
    const M = this._mem;
    const secs = Math.floor((Date.now() - M.start) / 1000);
    const base = CONFIG.POINTS.memoryBase;
    const timeBonus = Math.max(0, Math.round(CONFIG.POINTS.memoryTimeBonus * (1 - secs / 120)));
    const movePenalty = Math.max(0, (M.moves - this._memPairs) * 2);
    const score = Math.max(base, base + timeBonus - movePenalty);
    burstConfetti(140); playChime();
    this._finish('memory', score, `סיימת ב-${secs} שניות ו-${M.moves} מהלכים!`);
  },

  // ═══ חידון ═══
  async playTrivia() {
    if (!Profile.requireUser()) return;
    this.inGame = true;
    $('gamesHome').innerHTML = this.backBtn() + `<div class="card center"><div class="spinner-sm" style="margin:20px auto;"></div></div>`;
    let questions = [];
    try {
      const res = await apiCall('getQuiz');
      questions = (res.success && res.quiz) ? res.quiz : [];
    } catch (e) { showToast(e.message, 'error'); }
    if (!questions.length) {
      $('gamesHome').innerHTML = this.backBtn() + emptyState('❓', 'אין עדיין שאלות', 'הוסיפו שאלות בגיליון quiz');
      return;
    }
    // ערבוב שאלות + אפשרויות (עם מעקב אחרי התשובה הנכונה)
    const qs = shuffle(questions).slice(0, 8).map(q => {
      const correctText = q.options[q.correct];
      const opts = shuffle(q.options.slice());
      return { question: q.question, category: q.category || '', options: opts, correct: opts.indexOf(correctText) };
    });
    this._quiz = { qs, idx: 0, correct: 0 };
    this._renderQ();
  },

  _renderQ() {
    const Q = this._quiz, q = Q.qs[Q.idx];
    $('gamesHome').innerHTML = `
      ${this.backBtn()}
      <div class="card">
        <div class="quiz-progress">
          ${Q.qs.map((_, i) => `<div class="quiz-dot ${i < Q.idx ? 'done' : i === Q.idx ? 'current' : ''}"></div>`).join('')}
        </div>
        ${q.category ? `<div class="quiz-cat">${esc(q.category)}</div>` : ''}
        <div class="quiz-q">${esc(q.question)}</div>
        <div class="quiz-options" id="quizOpts">
          ${q.options.map((o, i) => `<button class="quiz-opt" data-i="${i}" onclick="Games._answer(${i})">${esc(o)}</button>`).join('')}
        </div>
      </div>`;
  },

  _answer(i) {
    const Q = this._quiz, q = Q.qs[Q.idx];
    const opts = document.querySelectorAll('#quizOpts .quiz-opt');
    opts.forEach(b => b.disabled = true);
    opts[q.correct].classList.add('correct');
    if (i === q.correct) { Q.correct++; playChime(); }
    else { opts[i].classList.add('wrong'); }
    setTimeout(() => {
      Q.idx++;
      if (Q.idx < Q.qs.length) this._renderQ();
      else this._quizEnd();
    }, 1100);
  },

  _quizEnd() {
    const Q = this._quiz;
    const total = Q.qs.length, correct = Q.correct;
    const perfect = correct === total;
    const score = correct * CONFIG.POINTS.triviaCorrect + (perfect ? CONFIG.POINTS.triviaPerfect : 0);
    if (correct > 0) burstConfetti(perfect ? 160 : 90);
    this._finish('trivia', score, `${correct}/${total} תשובות נכונות${perfect ? ' — מושלם! 🌟' : ''}`);
  },

  // ── סיום משחק: שליחת ניקוד + מסך תוצאה ──
  async _finish(gameId, score, subtitle) {
    const me = Profile.get();
    let added = score, isBest = true, total = Profile.points + score;
    if (CONFIGURED && me) {
      try {
        const res = await apiCall('submitScore', { userId: me.id, gameId, score, name: me.name, avatar: me.avatar, family: me.family || '' });
        if (res.success) { added = res.added; isBest = res.isBest; total = res.totalPoints; Profile.setPoints(total); }
      } catch (e) { showToast('הניקוד לא נשמר: ' + e.message, 'warning'); }
    }
    this.bests = this.bests || {};
    if (isBest) this.bests[gameId] = score;
    $('gamesHome').innerHTML = `
      <div class="card center" style="padding:36px 20px;">
        <div style="font-size:3.5rem;">${isBest ? '🏆' : '👏'}</div>
        <h2 style="font-family:var(--font-display);font-size:2rem;margin:8px 0;">${score} נקודות</h2>
        <p class="muted">${esc(subtitle)}</p>
        ${isBest ? `<div class="chip gold mt-md">שיא אישי חדש! +${added} נקודות נטו</div>`
                 : `<div class="chip mt-md">השיא שלך נשאר ${this.bests[gameId] || score}. נטו: +${added}</div>`}
        <div class="modal-footer" style="justify-content:center;">
          <button class="btn btn-secondary" onclick="Games.home()">טבלת מובילים</button>
          <button class="btn btn-primary" onclick="${gameId === 'memory' ? 'Games.playMemory()' : 'Games.playTrivia()'}">🔁 עוד סיבוב</button>
        </div>
      </div>`;
    this.inGame = false;
    App.loadSummary();
  },
};

// ── ערבוב (Fisher–Yates) ──
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
