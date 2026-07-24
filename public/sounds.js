// sounds.js — Songo Premium Edition
// All audio via Web Audio API (no external files)
'use strict';

const SoundEngine = (function () {
  let actx  = null;
  let musicNode = null;   // master gain for ambient music
  let musicRunning = false;
  let musicStopReq = false;

  // Persisted prefs
  let muted      = localStorage.getItem('songo_muted')  === 'true';
  let musicMuted = localStorage.getItem('songo_music')  === 'false'; // music off by default

  /* ── Init AudioContext ───────────────────────────────────── */
  function init() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
  }

  /* ── Low-level oscillator builder ───────────────────────── */
  function note(freq, start, type, gain, dur, dest) {
    if (!actx) return;
    const target = dest || actx.destination;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.connect(g);
    g.connect(target);
    o.frequency.value = freq;
    o.type = type;
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.start(start);
    o.stop(start + dur + 0.01);
  }

  /* ── Sound library ──────────────────────────────────────── */
  function play(type) {
    if (muted) return;
    try {
      init();
      if (!actx) return;
      const n = actx.currentTime;

      switch (type) {

        // Seed drop into pit — soft wooden thud
        case 'move':
          note(280, n,       'triangle', 0.12, 0.06);
          note(140, n+0.01,  'triangle', 0.06, 0.05);
          break;

        // Capture — rising two-note sting
        case 'capture':
          note(440, n,       'sine', 0.18, 0.13);
          note(660, n+0.12,  'sine', 0.18, 0.20);
          note(880, n+0.24,  'sine', 0.10, 0.14);
          break;

        // Extra turn — bright single note
        case 'bonus_turn':
          note(880, n,       'sine', 0.14, 0.10);
          note(1100,n+0.06,  'sine', 0.10, 0.22);
          break;

        // Victory — fanfare arpeggio
        case 'victory':
          [523, 659, 784, 1047, 1319].forEach((f, i) =>
            note(f, n + i * 0.12, 'sine', 0.18, 0.28)
          );
          break;

        // Defeat — descending minor phrase
        case 'defeat':
          [440, 370, 311, 261].forEach((f, i) =>
            note(f, n + i * 0.14, 'triangle', 0.10, 0.24)
          );
          break;

        // Illegal move — short buzz
        case 'illegal':
          note(160, n,       'square', 0.12, 0.07);
          note(140, n+0.04,  'square', 0.08, 0.06);
          break;

        // Match found — ascending motif
        case 'match_found':
          [440, 554, 659, 880, 1100].forEach((f, i) =>
            note(f, n + i * 0.09, 'sine', 0.15, 0.20)
          );
          break;

        // Draw — neutral resolved chord
        case 'draw':
          note(440, n,       'sine', 0.12, 0.35);
          note(554, n+0.02,  'sine', 0.10, 0.35);
          note(659, n+0.04,  'sine', 0.08, 0.35);
          break;

        // Turn notification — gentle ding
        case 'turn_notify':
          note(880,  n,      'sine', 0.10, 0.18);
          note(1100, n+0.12, 'sine', 0.06, 0.16);
          break;

        // Reconnect — short upward resolution
        case 'reconnect':
          note(440, n,       'sine', 0.10, 0.12);
          note(659, n+0.10,  'sine', 0.10, 0.18);
          note(880, n+0.20,  'sine', 0.08, 0.22);
          break;

        // UI click
        case 'click':
          note(600, n, 'sine', 0.06, 0.05);
          break;

        default:
          break;
      }
    } catch (e) {
      // Fail silently — AudioContext policy errors on some browsers
    }
  }

  /* ── Ambient African Percussion Music ───────────────────── */
  // Pure Web Audio synthesis — no files
  function startMusic() {
    if (musicMuted || musicRunning) return;
    try {
      init();
      if (!actx) return;
      musicRunning = true;
      musicStopReq = false;

      // Master gain for music (separate from SFX)
      const masterGain = actx.createGain();
      masterGain.gain.setValueAtTime(0.07, actx.currentTime);
      masterGain.connect(actx.destination);
      musicNode = masterGain;

      // Djembe-inspired rhythmic loop
      scheduleDjembe(masterGain);
    } catch (e) {}
  }

  function stopMusic() {
    musicStopReq = true;
    musicRunning = false;
    if (musicNode) {
      try { musicNode.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.5); } catch(e){}
      setTimeout(() => { musicNode = null; }, 600);
    }
  }

  // Simple 4-beat pattern (djembe tones)
  function scheduleDjembe(dest) {
    if (musicStopReq || !actx) return;
    const n     = actx.currentTime;
    const beat  = 0.55; // seconds per beat
    const hits  = [
      // [freq, offset, gain, dur, type]
      [200, 0.0,  0.9, 0.12, 'triangle'],
      [160, 0.55, 0.6, 0.10, 'triangle'],
      [220, 1.10, 0.9, 0.12, 'triangle'],
      [160, 1.40, 0.5, 0.08, 'triangle'],
      [200, 1.65, 0.7, 0.10, 'triangle'],
      [140, 2.20, 0.6, 0.10, 'triangle'],
    ];

    hits.forEach(([freq, off, g, d, type]) => {
      const o = actx.createOscillator();
      const gn = actx.createGain();
      const dist = actx.createWaveShaper();
      // Slight distortion for warmth
      dist.curve = makeDistCurve(60);
      o.connect(dist); dist.connect(gn); gn.connect(dest);
      o.type = type;
      o.frequency.value = freq;
      gn.gain.setValueAtTime(g * 0.15, n + off);
      gn.gain.exponentialRampToValueAtTime(0.0001, n + off + d);
      o.start(n + off);
      o.stop(n + off + d + 0.01);
    });

    // Schedule next loop
    const loopMs = hits.at(-1)[1] * 1000 + 300;
    setTimeout(() => scheduleDjembe(dest), loopMs);
  }

  function makeDistCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    play,

    // SFX mute
    mute:   () => { muted = true;  localStorage.setItem('songo_muted', 'true');  },
    unmute: () => { muted = false; localStorage.setItem('songo_muted', 'false'); init(); },
    toggle: () => {
      muted = !muted;
      localStorage.setItem('songo_muted', muted.toString());
      if (!muted) init();
      return muted;
    },
    isMuted: () => muted,

    // Music
    startMusic,
    stopMusic,
    toggleMusic: () => {
      musicMuted = !musicMuted;
      localStorage.setItem('songo_music', musicMuted ? 'false' : 'true');
      if (musicMuted) stopMusic();
      else startMusic();
      return musicMuted;
    },
    isMusicMuted: () => musicMuted,

    // Allow UI to init audio context (needs user gesture)
    init
  };
})();

window.SoundEngine = SoundEngine;
