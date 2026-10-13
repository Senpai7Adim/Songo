/**
 * scroll-animation.js
 * ─────────────────────────────────────────────────────────────────
 * Cinematic scroll-linked image-sequence animation for Songo hero.
 *
 * Architecture:
 *  • A tall <div #scroll-driver> is inserted into the DOM to make
 *    the page scrollable while #menu stays fixed.
 *  • A full-screen <canvas #hero-canvas> is placed inside
 *    .home-bg-layers (behind all existing content).
 *  • Scroll progress drives frame index with smooth LERP easing.
 *  • Supports retina (DPR), is fully responsive, and respects
 *    prefers-reduced-motion.
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────── */
  const TOTAL_FRAMES      = 31;
  const FRAME_PATH        = '/assests/videoFrames/ezgif-frame-';
  const SCROLL_MULTIPLIER = 4;   // hero height = 400vh
  const LERP_FACTOR       = 0.09; // smoothness (lower = silkier)
  const LERP_FACTOR_REDUCED = 1;  // instant when reduced-motion

  /* ── State ───────────────────────────────────────────────────── */
  let frames        = [];
  let currentFrame  = 0;   // fractional, interpolated
  let targetFrame   = 0;   // driven by scroll
  let canvas, ctx;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lerpFactor    = reducedMotion ? LERP_FACTOR_REDUCED : LERP_FACTOR;
  let isMenuVisible = true;

  /* ── Helpers ─────────────────────────────────────────────────── */
  function pad(n) {
    return String(n).padStart(3, '0');
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /* ── Canvas setup ────────────────────────────────────────────── */
  function createCanvas() {
    canvas = document.createElement('canvas');
    canvas.id = 'hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    Object.assign(canvas.style, {
      position:  'absolute',
      inset:     '0',
      width:     '100%',
      height:    '100%',
      display:   'block',
      zIndex:    '0',
    });

    ctx = canvas.getContext('2d', { alpha: false });

    // Insert as first child of .home-bg-layers (behind everything)
    const bgLayers = document.querySelector('.home-bg-layers');
    if (bgLayers) {
      bgLayers.insertBefore(canvas, bgLayers.firstChild);
    }
  }

  /* ── Resize handler ──────────────────────────────────────────── */
  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = window.innerWidth;
    const h   = window.innerHeight;

    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // Reset transform after resize
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Re-draw immediately after resize
    drawFrame(Math.round(currentFrame));
  }

  /* ── Frame drawing ───────────────────────────────────────────── */
  function drawFrame(index) {
    if (!ctx || !canvas) return;

    const idx = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(index)));
    const img = frames[idx];

    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.width  / dpr;
    const h   = canvas.height / dpr;

    // Always fill with luxury background colour first
    ctx.fillStyle = '#1A1208';
    ctx.fillRect(0, 0, w, h);

    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Cover-fit: maintain aspect ratio, fill canvas
    const iw    = img.naturalWidth;
    const ih    = img.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const sw    = iw * scale;
    const sh    = ih * scale;
    const sx    = (w - sw) / 2;
    const sy    = (h - sh) / 2;

    ctx.drawImage(img, sx, sy, sw, sh);
  }

  /* ── Frame preloading ────────────────────────────────────────── */
  function preloadFrames() {
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.src = FRAME_PATH + pad(i) + '.jpg';

      img.onload = () => {
        // Draw the very first frame as soon as it's ready
        if (i === 1) {
          drawFrame(0);
        }
      };

      frames[i - 1] = img;
    }
  }

  /* ── Scroll driver (tall spacer) ─────────────────────────────── */
  function createScrollDriver() {
    const menu = document.getElementById('menu');
    if (!menu || menu.classList.contains('hidden')) return;

    // Remove old driver if it exists
    removeScrollDriver();

    const driver = document.createElement('div');
    driver.id = 'scroll-driver';

    Object.assign(driver.style, {
      position:      'relative',
      width:         '100%',
      height:        `${SCROLL_MULTIPLIER * 100}vh`,
      pointerEvents: 'none',
      zIndex:        '1',
    });

    // Insert into body so it provides scroll height
    document.body.insertBefore(driver, document.body.firstChild);
  }

  function removeScrollDriver() {
    const old = document.getElementById('scroll-driver');
    if (old) old.remove();
  }

  /* ── Scroll calculation ──────────────────────────────────────── */
  function onScroll() {
    const menu = document.getElementById('menu');
    if (!menu || menu.classList.contains('hidden')) return;

    const scrollY   = window.scrollY || window.pageYOffset;
    const maxScroll = (SCROLL_MULTIPLIER - 1) * window.innerHeight;
    const progress  = Math.min(1, Math.max(0, scrollY / maxScroll));

    // Map 0–1 → 0–(TOTAL_FRAMES-1)
    targetFrame = progress * (TOTAL_FRAMES - 1);
  }

  /* ── RAF animation loop ──────────────────────────────────────── */
  function animationLoop() {
    requestAnimationFrame(animationLoop);

    // Smoothly interpolate toward target frame
    const prevFrame  = currentFrame;
    currentFrame = lerp(currentFrame, targetFrame, lerpFactor);

    // Only redraw if there's meaningful change
    if (Math.abs(currentFrame - prevFrame) > 0.001) {
      drawFrame(currentFrame);
    }
  }

  /* ── Menu visibility observer ────────────────────────────────── */
  function watchMenuVisibility() {
    const menu = document.getElementById('menu');
    if (!menu) return;

    isMenuVisible = !menu.classList.contains('hidden');

    const observer = new MutationObserver(() => {
      const nowVisible = !menu.classList.contains('hidden');

      if (nowVisible && !isMenuVisible) {
        // Menu just became visible — restore scroll driver & reset
        createScrollDriver();
        isMenuVisible = true;
      } else if (!nowVisible && isMenuVisible) {
        // Menu hidden (game started) — clean up scroll driver
        removeScrollDriver();
        isMenuVisible = false;
        // Snap back to frame 0 when menu returns
        currentFrame = 0;
        targetFrame  = 0;
      }
    });

    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Patch backToMenu to reset scroll ────────────────────────── */
  function patchBackToMenu() {
    const origBackToMenu = window.backToMenu;
    if (typeof origBackToMenu === 'function') {
      window.backToMenu = function (...args) {
        const result = origBackToMenu.apply(this, args);
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          currentFrame = 0;
          targetFrame  = 0;
          drawFrame(0);
          createScrollDriver();
        }, 80);
        return result;
      };
    }
  }

  /* ── Fade the static bg-image since canvas takes over ──────── */
  function adjustBackgroundLayers() {
    const bgImage = document.querySelector('.home-bg-image');
    if (bgImage) {
      bgImage.style.transition = 'opacity 0.8s ease';
      bgImage.style.opacity    = '0';
    }
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    createCanvas();
    resizeCanvas();
    preloadFrames();
    createScrollDriver();
    watchMenuVisibility();
    adjustBackgroundLayers();

    // Give script.js time to define backToMenu before patching
    setTimeout(patchBackToMenu, 1500);

    // Event listeners
    window.addEventListener('scroll',  onScroll,    { passive: true });
    window.addEventListener('resize',  resizeCanvas, { passive: true });

    // Watch for reduced-motion changes at runtime
    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', (e) => {
        reducedMotion = e.matches;
        lerpFactor    = reducedMotion ? LERP_FACTOR_REDUCED : LERP_FACTOR;
      });

    // Start the persistent RAF loop
    animationLoop();
  }

  /* ── Entry point ─────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
