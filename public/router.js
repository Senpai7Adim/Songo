/**
 * router.js
 * ─────────────────────────────────────────────────────────────────
 * Lightweight client-side router with route guards for Songo.
 * Handles SPA navigation, URL sync, browser history (back/forward),
 * and redirects first-time players to /welcome while routing returning
 * players directly to /home.
 * ─────────────────────────────────────────────────────────────────
 */
'use strict';

(function () {
  const routes = {};
  let currentPath = null;
  let isNavigating = false;

  function normalizePath(raw) {
    if (!raw) return '/';
    let p = String(raw).trim();
    if (p.startsWith('#')) p = p.slice(1);
    if (!p.startsWith('/')) p = '/' + p;
    // Strip queries & trailing slash (except root)
    p = p.split('?')[0].split('#')[0];
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  function getBrowserPath() {
    // If hash contains a path (e.g. #/welcome or #welcome)
    if (window.location.hash && window.location.hash.length > 1) {
      const h = window.location.hash.slice(1);
      if (h.startsWith('/')) return normalizePath(h);
    }
    return normalizePath(window.location.pathname);
  }

  function routeGuard(targetPath) {
    let setupDone = false;
    try {
      if (window.Profile && typeof Profile.get === 'function') {
        setupDone = !!Profile.get().setupDone;
      } else {
        const raw = localStorage.getItem('songo_identity');
        if (raw) setupDone = !!JSON.parse(raw).setupDone;
      }
    } catch (e) {
      setupDone = false;
    }

    if (!setupDone) {
      // First-time player: force /welcome
      if (targetPath !== '/welcome') {
        return '/welcome';
      }
    } else {
      // Returning player: /welcome redirects to home
      if (targetPath === '/welcome') {
        return '/home';
      }
    }

    // Default root path is treated as /home
    if (targetPath === '/') return '/home';

    return targetPath;
  }

  function executeHandler(path) {
    const handler = routes[path] || routes['/home'] || routes['/'];
    if (typeof handler === 'function') {
      try {
        handler(path);
      } catch (err) {
        console.error('[Router] Handler error for', path, err);
      }
    }
  }

  const Router = {
    /**
     * Register a route path and its handler
     */
    register(path, handler) {
      routes[normalizePath(path)] = handler;
      return this;
    },

    /**
     * Get current active route path
     */
    current() {
      return currentPath;
    },

    /**
     * Programmatically navigate to a route
     */
    navigate(targetPath, replace = false) {
      const norm = normalizePath(targetPath);
      const destination = routeGuard(norm);

      if (currentPath === destination && !replace) {
        return;
      }

      isNavigating = true;
      try {
        if (replace) {
          history.replaceState({ path: destination }, '', destination);
        } else {
          history.pushState({ path: destination }, '', destination);
        }
      } catch (e) {
        // Fallback to hash if HTML5 history throws (e.g. file:// protocol)
        window.location.hash = destination;
      }
      isNavigating = false;

      currentPath = destination;
      executeHandler(destination);
    },

    /**
     * Replace current route without adding a history entry
     */
    replace(targetPath) {
      return Router.navigate(targetPath, true);
    },

    /**
     * Resolve and activate route matching current browser location
     */
    resolve() {
      if (isNavigating) return;
      const rawPath = getBrowserPath();
      const destination = routeGuard(rawPath);

      // If guard redirected us, update URL silently
      if (destination !== rawPath) {
        try {
          history.replaceState({ path: destination }, '', destination);
        } catch (e) {
          window.location.hash = destination;
        }
      }

      currentPath = destination;
      executeHandler(destination);
    },

    /**
     * Re-evaluate route guard and current route
     */
    refresh() {
      Router.resolve();
    },

    /**
     * Setup event listeners and perform initial route resolution
     */
    init() {
      window.addEventListener('popstate', () => {
        Router.resolve();
      });
      window.addEventListener('hashchange', () => {
        Router.resolve();
      });
      Router.resolve();
    }
  };

  window.Router = Router;
})();
