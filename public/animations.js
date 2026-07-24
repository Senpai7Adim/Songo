// animations.js — Songo Premium Edition
// All animations, particles, and visual feedback
'use strict';

const Animations = (function () {

  /* ── helpers ─────────────────────────────────────────────── */
  function wt(ms) { return new Promise(r => setTimeout(r, ms)); }

  function raf() {
    return new Promise(r => requestAnimationFrame(r));
  }

  // Clamp helper
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Linear interpolation
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ── Confetti ────────────────────────────────────────────── */
  function confetti(originEl) {
    const container = document.body;
    const origin    = originEl || document.getElementById('bwrap') || document.body;
    const rect      = origin.getBoundingClientRect();
    const cx        = rect.left + rect.width  / 2;
    const cy        = rect.top  + rect.height / 2;

    // African-inspired palette + shapes
    const colors  = ['#F5D08A','#C8922A','#FF9944','#50D28A','#88BBFF',
                      '#FF88CC','#2D6A4F','#C8922A','#E8C84A','#FF8844'];
    const shapes  = ['50%','0%','30%']; // circle, square, diamond

    const count = 80;

    for (let i = 0; i < count; i++) {
      const delay  = i * 20;
      const dur    = 1200 + Math.random() * 1200;
      const sz     = 6 + Math.random() * 9;
      const color  = colors[Math.floor(Math.random() * colors.length)];
      const shape  = shapes[Math.floor(Math.random() * shapes.length)];

      // Burst in random directions from board center
      const angle  = (Math.random() * 360) * Math.PI / 180;
      const speed  = 60 + Math.random() * 160;
      const vx     = Math.cos(angle) * speed;
      const vy     = Math.sin(angle) * speed - 80; // upward bias
      const rot    = Math.random() * 720 - 360;

      const p = document.createElement('div');
      p.style.cssText = [
        `position:fixed`,
        `left:${cx}px`, `top:${cy}px`,
        `width:${sz}px`, `height:${sz * (0.4 + Math.random() * 0.6)}px`,
        `background:${color}`,
        `border-radius:${shape}`,
        `pointer-events:none`,
        `z-index:9999`,
        `transform-origin:center`,
        `transition:none`
      ].join(';');
      container.appendChild(p);

      // Animate via rAF
      let start = null;
      function frame(ts) {
        if (!start) start = ts;
        const elapsed = ts - start;
        const progress = clamp(elapsed / dur, 0, 1);
        const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        const x = vx * eased * (dur / 1000);
        const y = vy * eased * (dur / 1000) + 0.5 * 400 * eased * eased * (dur / 1000);
        const r = rot * eased;
        const opacity = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;

        p.style.transform  = `translate(${x}px,${y}px) rotate(${r}deg)`;
        p.style.opacity    = opacity;

        if (progress < 1) {
          setTimeout(() => requestAnimationFrame(frame), delay > 0 ? delay : 0);
          delay = 0; // only first frame delayed
        } else {
          p.remove();
        }
      }
      setTimeout(() => requestAnimationFrame(frame), delay);
    }
  }

  /* ── Arc Seed Flight ──────────────────────────────────────── */
  async function seedFly(from, to, col) {
    if (!from || !to) return;
    const wrap = document.getElementById('bwrap') || document.body;

    const s = document.createElement('div');
    s.className = 'fseed';
    s.style.background  = col;
    s.style.boxShadow   = `0 0 8px ${col}BB, inset -2px -2px 4px rgba(0,0,0,0.5)`;
    s.style.left = from.x + 'px';
    s.style.top  = from.y + 'px';
    wrap.appendChild(s);

    await wt(10);

    // Arc mid-point
    const midX = lerp(from.x, to.x, 0.5);
    const midY = Math.min(from.y, to.y) - clamp(
      Math.hypot(to.x - from.x, to.y - from.y) * 0.35, 8, 40
    );

    const dur = 170;
    let start = null;

    await new Promise(resolve => {
      function step(ts) {
        if (!start) start = ts;
        const t  = clamp((ts - start) / dur, 0, 1);
        const t2 = 1 - t;

        // Quadratic bezier
        const x = t2 * t2 * from.x + 2 * t2 * t * midX + t * t * to.x;
        const y = t2 * t2 * from.y + 2 * t2 * t * midY + t * t * to.y;

        s.style.left = x + 'px';
        s.style.top  = y + 'px';
        s.style.transform = `translate(-50%,-50%) scale(${0.85 + 0.3 * Math.sin(t * Math.PI)})`;

        if (t < 1) { requestAnimationFrame(step); }
        else        { resolve(); }
      }
      requestAnimationFrame(step);
    });

    s.style.opacity = '0';
    await wt(80);
    s.remove();
  }

  /* ── Float label (+1 / capture) ─────────────────────────── */
  function floatLabel(el, text, col) {
    if (!el) return;
    const l = document.createElement('span');
    l.className    = 'flb';
    l.style.color  = col;
    l.textContent  = text;
    el.appendChild(l);
    setTimeout(() => l.remove(), 680);
  }

  /* ── Shake (illegal move) ────────────────────────────────── */
  function shakeEl(el) {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  }

  /* ── Pulse animation ─────────────────────────────────────── */
  function pulseEl(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  /* ── Board my-turn glow ──────────────────────────────────── */
  function setBoardGlow(active) {
    const board = document.getElementById('board');
    if (!board) return;
    board.classList.toggle('my-turn', active);
  }

  /* ── Thinking dots on player card ───────────────────────── */
  function setThinking(isThinking) {
    const el = document.getElementById('think-ai');
    if (!el) return;
    el.classList.toggle('active', isThinking);
  }

  /* ── Countdown: 3…2…1…GO ─────────────────────────────────── */
  async function countdown(n, onDone) {
    const overlay = document.getElementById('countdown-overlay');
    if (!overlay) { if (onDone) onDone(); return; }

    overlay.classList.remove('hidden');
    overlay.innerHTML = '';

    const colors3 = ['var(--gold-light)', '#FFA040', '#FF6040', 'var(--emerald-light)'];

    for (let i = n; i > 0; i--) {
      const num = document.createElement('div');
      num.className    = 'countdown-num';
      num.textContent  = i;
      num.style.color  = colors3[n - i];
      overlay.innerHTML = '';
      overlay.appendChild(num);
      if (window.SoundEngine) window.SoundEngine.play('move');
      await wt(920);
    }

    const go = document.createElement('div');
    go.className   = 'countdown-num go';
    go.textContent = 'GO!';
    overlay.innerHTML = '';
    overlay.appendChild(go);
    if (window.SoundEngine) window.SoundEngine.play('bonus_turn');

    await wt(750);
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    if (onDone) onDone();
  }

  /* ── Match Found overlay ─────────────────────────────────── */
  async function matchFound(opts, cb) {
    const overlay = document.getElementById('match-found-overlay');
    if (!overlay) { if (cb) cb(); return; }

    if (window.SoundEngine) window.SoundEngine.play('match_found');

    // Fill avatar slots if provided
    if (opts) {
      const meEl  = document.getElementById('mf-avatar-me');
      const oppEl = document.getElementById('mf-avatar-opp');
      if (meEl  && opts.me)  meEl.textContent  = opts.me;
      if (oppEl && opts.opp) oppEl.textContent = opts.opp;
    }

    overlay.classList.remove('hidden');
    await wt(40);
    overlay.classList.add('show');
    await wt(2200);
    overlay.classList.remove('show');
    await wt(350);
    overlay.classList.add('hidden');
    if (cb) cb();
  }

  /* ── Victory ─────────────────────────────────────────────── */
  function celebrateVictory() {
    confetti(document.getElementById('bwrap'));
    // Board golden flash
    const board = document.getElementById('board');
    if (board) {
      board.style.transition = 'box-shadow 0.3s';
      board.style.boxShadow  = '0 0 60px rgba(200,146,42,0.7), inset 0 0 40px rgba(200,146,42,0.15), 0 18px 50px rgba(0,0,0,0.55)';
      setTimeout(() => { board.style.boxShadow = ''; board.style.transition = ''; }, 2000);
    }
  }

  /* ── Defeat ──────────────────────────────────────────────── */
  function animateDefeat() {
    const board = document.getElementById('board');
    if (!board) return;
    board.style.transition = 'filter 0.8s, opacity 0.8s';
    board.style.filter     = 'saturate(0.3) brightness(0.7)';
    board.style.opacity    = '0.75';
    setTimeout(() => {
      board.style.filter  = '';
      board.style.opacity = '';
      setTimeout(() => { board.style.transition = ''; }, 800);
    }, 2500);
  }

  /* ── Draw ────────────────────────────────────────────────── */
  function animateDraw() {
    const board = document.getElementById('board');
    if (!board) return;
    board.style.transition = 'box-shadow 0.5s';
    board.style.boxShadow  = '0 0 40px rgba(245,236,215,0.25), inset 0 0 40px rgba(245,236,215,0.06), 0 18px 50px rgba(0,0,0,0.55)';
    setTimeout(() => { board.style.boxShadow = ''; board.style.transition = ''; }, 2000);
  }

  /* ── Show rich end-of-game modal ─────────────────────────── */
  function showEndModal({ result, yourScore, oppScore, yourName, oppName }) {
    const overlay = document.getElementById('end-modal-overlay');
    const modal   = document.getElementById('end-modal');
    if (!overlay || !modal) return;

    const iconEl  = document.getElementById('end-icon');
    const titleEl = document.getElementById('end-modal-title');
    const subEl   = document.getElementById('end-modal-sub');
    const youEl   = document.getElementById('end-score-you');
    const oppEl   = document.getElementById('end-score-opp');

    document.getElementById('end-name-you').textContent = yourName || 'Vous';
    document.getElementById('end-name-opp').textContent = oppName  || 'Adversaire';
    document.getElementById('end-val-you').textContent  = yourScore;
    document.getElementById('end-val-opp').textContent  = oppScore;

    modal.className = 'end-modal';
    youEl.classList.remove('winner');
    oppEl.classList.remove('winner');

    if (result === 'win') {
      modal.classList.add('win');
      iconEl.textContent  = '🏆';
      titleEl.textContent = 'Victoire !';
      subEl.textContent   = `${yourScore} graines capturées`;
      youEl.classList.add('winner');
      celebrateVictory();
    } else if (result === 'loss') {
      modal.classList.add('loss');
      iconEl.textContent  = '🌿';
      titleEl.textContent = 'Défaite';
      subEl.textContent   = `Bien joué, à la prochaine !`;
      oppEl.classList.add('winner');
      animateDefeat();
    } else {
      modal.classList.add('draw');
      iconEl.textContent  = '🤝';
      titleEl.textContent = 'Égalité !';
      subEl.textContent   = `${yourScore} graines chacun`;
      animateDraw();
    }

    overlay.classList.remove('hidden');
  }

  function hideEndModal() {
    const overlay = document.getElementById('end-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ── Vibrate (mobile haptics) ────────────────────────────── */
  function vibrate(pattern) {
    if (navigator.vibrate && window._vibrateEnabled !== false) {
      navigator.vibrate(pattern);
    }
  }

  /* ── Score bump animation ────────────────────────────────── */
  function bumpScore(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    el.addEventListener('animationend', () => el.classList.remove('bump'), { once: true });
  }

  return {
    wt,
    raf,
    confetti,
    seedFly,
    floatLabel,
    shakeEl,
    pulseEl,
    setBoardGlow,
    setThinking,
    countdown,
    matchFound,
    celebrateVictory,
    animateDefeat,
    animateDraw,
    showEndModal,
    hideEndModal,
    vibrate,
    bumpScore
  };
})();

window.Animations = Animations;
