// profile.js — identity, stats, ELO, match history (localStorage)
'use strict';

const Profile = (function () {
  const KEY = 'songo_identity';
  const TOKEN_KEY = 'songo_token';
  const MAX_MATCHES = 40;
  const ELO_START = 1200;
  const ELO_MIN = 100;
  const K = 24;

  const AVATARS = [
    '👤','🧔','👩','🧒','👴','👵',
    '🦁','🐆','🐘','🦍','🦅','🐍',
    '🥁','🌾','⭐','🔥','👑','🎯',
    '🪵','🌙','☀️','💎','🦋','🎵'
  ];

  const COUNTRIES = [
    { code: 'CM', emoji: '🇨🇲', name: 'Cameroun' },
    { code: 'TD', emoji: '🇹🇩', name: 'Tchad' },
    { code: 'CG', emoji: '🇨🇬', name: 'Congo' },
    { code: 'GA', emoji: '🇬🇦', name: 'Gabon' },
    { code: 'GQ', emoji: '🇬🇶', name: 'Guinée équatoriale' },
    { code: 'CF', emoji: '🇨🇫', name: 'Centrafrique' },
    { code: 'NG', emoji: '🇳🇬', name: 'Nigeria' },
    { code: 'SN', emoji: '🇸🇳', name: 'Sénégal' },
    { code: 'CI', emoji: '🇨🇮', name: "Côte d'Ivoire" },
    { code: 'GH', emoji: '🇬🇭', name: 'Ghana' },
    { code: 'ML', emoji: '🇲🇱', name: 'Mali' },
    { code: 'BF', emoji: '🇧🇫', name: 'Burkina Faso' },
    { code: 'BJ', emoji: '🇧🇯', name: 'Bénin' },
    { code: 'TG', emoji: '🇹🇬', name: 'Togo' },
    { code: 'GN', emoji: '🇬🇳', name: 'Guinée' },
    { code: 'CD', emoji: '🇨🇩', name: 'RDC' },
    { code: 'MA', emoji: '🇲🇦', name: 'Maroc' },
    { code: 'DZ', emoji: '🇩🇿', name: 'Algérie' },
    { code: 'TN', emoji: '🇹🇳', name: 'Tunisie' },
    { code: 'EG', emoji: '🇪🇬', name: 'Égypte' },
    { code: 'ZA', emoji: '🇿🇦', name: 'Afrique du Sud' },
    { code: 'KE', emoji: '🇰🇪', name: 'Kenya' },
    { code: 'FR', emoji: '🇫🇷', name: 'France' },
    { code: 'BE', emoji: '🇧🇪', name: 'Belgique' },
    { code: 'CA', emoji: '🇨🇦', name: 'Canada' },
    { code: 'US', emoji: '🇺🇸', name: 'États-Unis' },
    { code: 'GB', emoji: '🇬🇧', name: 'Royaume-Uni' },
    { code: 'BR', emoji: '🇧🇷', name: 'Brésil' },
    { code: 'HT', emoji: '🇭🇹', name: 'Haïti' },
    { code: 'XX', emoji: '🌍', name: 'Autre' }
  ];

  const AI_OPPONENTS = {
    1: { name: 'Kossi',  title: 'Débutant',      avatar: '😊', flag: '🇨🇲', elo: 800  },
    2: { name: 'Mireille', title: 'Intermédiaire', avatar: '🧠', flag: '🇨🇲', elo: 1100 },
    3: { name: 'Njoya',  title: 'Expert',        avatar: '🔥', flag: '🇨🇲', elo: 1400 },
    4: { name: 'Sultan', title: 'Maître',        avatar: '👑', flag: '🇨🇲', elo: 1700 }
  };

  const ONLINE_OPP = { name: 'Adversaire', avatar: '👤', flag: '🌍', elo: ELO_START };
  const LOCAL_OPP  = { name: 'Joueur 2',   avatar: '👥', flag: '🇨🇲', elo: ELO_START };

  function blankAi() {
    return { w: 0, l: 0, d: 0 };
  }

  function defaultState() {
    return {
      name: '',
      avatar: '👤',
      flag: '🇨🇲',
      country: 'CM',
      setupDone: false,
      elo: ELO_START,
      eloPeak: ELO_START,
      stats: {
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0,
        streak: 0,
        bestStreak: 0,
        byAi: { 1: blankAi(), 2: blankAi(), 3: blankAi(), 4: blankAi() },
        online: { w: 0, l: 0, d: 0 },
        local: { games: 0 }
      },
      matches: []
    };
  }

  function mergeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    base.name = String(raw.name || '').slice(0, 16);
    base.avatar = AVATARS.includes(raw.avatar) ? raw.avatar : '👤';
    const c = COUNTRIES.find(x => x.code === raw.country) || COUNTRIES[0];
    base.country = c.code;
    base.flag = c.emoji;
    base.setupDone = !!raw.setupDone;
    const elo = Number(raw.elo);
    base.elo = Number.isFinite(elo) ? Math.max(ELO_MIN, Math.round(elo)) : ELO_START;
    const peak = Number(raw.eloPeak);
    base.eloPeak = Number.isFinite(peak) ? Math.max(base.elo, Math.round(peak)) : base.elo;
    if (raw.stats && typeof raw.stats === 'object') {
      const s = raw.stats;
      base.stats.wins = s.wins | 0;
      base.stats.losses = s.losses | 0;
      base.stats.draws = s.draws | 0;
      base.stats.games = s.games | 0;
      base.stats.streak = s.streak | 0;
      base.stats.bestStreak = s.bestStreak | 0;
      for (let i = 1; i <= 4; i++) {
        const b = (s.byAi && s.byAi[i]) || {};
        base.stats.byAi[i] = { w: b.w | 0, l: b.l | 0, d: b.d | 0 };
      }
      if (s.online) {
        base.stats.online = { w: s.online.w | 0, l: s.online.l | 0, d: s.online.d | 0 };
      }
      if (s.local) base.stats.local = { games: s.local.games | 0 };
    }
    if (Array.isArray(raw.matches)) {
      base.matches = raw.matches.slice(0, MAX_MATCHES);
    }
    return base;
  }

  let state = defaultState();
  let _token = '';
  let _onlineOpp = null;
  let _leaderboard = { list: [], me: null };

  function token() {
    if (_token) return _token;
    try { _token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { _token = ''; }
    return _token;
  }

  function setToken(t) {
    _token = t || '';
    try {
      if (_token) localStorage.setItem(TOKEN_KEY, _token);
    } catch (e) { /* private mode */ }
  }

  function applySnapshot(player, matches) {
    if (!player) return state;
    const next = mergeState(Object.assign({}, player, {
      setupDone: player.setupDone,
      matches: Array.isArray(matches) ? matches : state.matches
    }));
    next.setupDone = !!(player.setupDone || state.setupDone);
    if (player.id) next.id = player.id;
    state = next;
    save();
    return state;
  }

  async function api(path, opts) {
    const o = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
    const tok = token();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const res = await fetch(path, Object.assign({}, o, { headers }));
    if (!res.ok) {
      let err = 'HTTP ' + res.status;
      try { const j = await res.json(); err = j.error || err; } catch (e) {}
      throw new Error(err);
    }
    return res.json();
  }

  async function ensureSession() {
    const seed = (state.setupDone || state.stats.games > 0) ? {
      name: state.name,
      avatar: state.avatar,
      country: state.country,
      elo: state.elo,
      eloPeak: state.eloPeak,
      stats: state.stats,
      matches: state.matches
    } : null;
    const data = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ token: token(), seed })
    });
    if (data.token) setToken(data.token);
    if (data.player) applySnapshot(data.player, data.matches);
    return data;
  }

  async function pushProfile() {
    if (!token()) return null;
    try {
      const data = await api('/api/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: state.name,
          avatar: state.avatar,
          country: state.country
        })
      });
      if (data.player) applySnapshot(data.player, data.matches);
      return data.player;
    } catch (e) { return null; }
  }

  async function postMatch(opts) {
    if (!token()) return null;
    try {
      const data = await api('/api/matches', { method: 'POST', body: JSON.stringify(opts) });
      if (data.player) applySnapshot(data.player, data.matches);
      return data;
    } catch (e) { return null; }
  }

  async function fetchLeaderboard() {
    try {
      const q = token() ? ('?token=' + encodeURIComponent(token())) : '';
      const data = await api('/api/leaderboard' + q, { method: 'GET', headers: {} });
      _leaderboard = { list: data.list || [], me: data.me || null };
      return _leaderboard;
    } catch (e) {
      return _leaderboard;
    }
  }

  function setOnlineOpponent(p) {
    _onlineOpp = p || null;
  }

  function onlineOpponent() {
    return _onlineOpp;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = mergeState(raw ? JSON.parse(raw) : null);
    } catch (e) {
      state = defaultState();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* quota / private mode */ }
  }

  function get() {
    return state;
  }

  function displayName() {
    return state.name.trim() || 'Joueur';
  }

  function countryOf(code) {
    return COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
  }

  function expectedScore(myElo, oppElo) {
    return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
  }

  function eloDelta(myElo, oppElo, score) {
    return Math.round(K * (score - expectedScore(myElo, oppElo)));
  }

  function updateProfile({ name, avatar, country }) {
    if (name !== undefined) {
      state.name = String(name).replace(/\s+/g, ' ').trim().slice(0, 16);
    }
    if (avatar && AVATARS.includes(avatar)) state.avatar = avatar;
    if (country) {
      const c = countryOf(country);
      state.country = c.code;
      state.flag = c.emoji;
    }
    state.setupDone = true;
    save();
    pushProfile();
    return state;
  }

  function scoreFromResult(result) {
    if (result === 'win') return 1;
    if (result === 'draw') return 0.5;
    return 0;
  }

  function bumpBucket(bucket, result) {
    if (!bucket) return;
    if (result === 'win') bucket.w++;
    else if (result === 'loss') bucket.l++;
    else bucket.d++;
  }

  function recordMatch(opts) {
    const mode = opts.mode || 'ai';
    const result = opts.result || 'draw';
    const rated = opts.rated !== false && (mode === 'ai' || mode === 'online');
    const oppElo = Number(opts.oppElo) || ELO_START;
    let delta = 0;
    const eloBefore = state.elo;

    state.stats.games++;

    if (mode === 'local') {
      state.stats.local.games++;
    } else if (rated) {
      if (result === 'win') {
        state.stats.wins++;
        state.stats.streak = state.stats.streak >= 0 ? state.stats.streak + 1 : 1;
      } else if (result === 'loss') {
        state.stats.losses++;
        state.stats.streak = state.stats.streak <= 0 ? state.stats.streak - 1 : -1;
      } else {
        state.stats.draws++;
        state.stats.streak = 0;
      }
      const absStreak = Math.abs(state.stats.streak);
      if (result === 'win' && absStreak > state.stats.bestStreak) {
        state.stats.bestStreak = absStreak;
      }
      if (mode === 'ai') bumpBucket(state.stats.byAi[opts.aiDiff], result);
      if (mode === 'online') bumpBucket(state.stats.online, result);

      delta = eloDelta(state.elo, oppElo, scoreFromResult(result));
      state.elo = Math.max(ELO_MIN, state.elo + delta);
      if (state.elo > state.eloPeak) state.eloPeak = state.elo;
    }

    const match = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      mode,
      result: mode === 'local' ? (result === 'draw' ? 'draw' : result) : result,
      yourScore: opts.yourScore | 0,
      oppScore: opts.oppScore | 0,
      oppName: opts.oppName || 'Adversaire',
      oppAvatar: opts.oppAvatar || '👤',
      rated,
      eloDelta: rated ? delta : 0,
      eloAfter: state.elo,
      eloBefore,
      aiDiff: opts.aiDiff || null,
      timeControl: opts.timeControl || '∞',
      reason: opts.reason || 'normal'
    };
    state.matches.unshift(match);
    if (state.matches.length > MAX_MATCHES) state.matches.length = MAX_MATCHES;
    save();
    return { eloDelta: delta, newElo: state.elo, rated, eloBefore, match };
  }

  function winRate() {
    const n = state.stats.wins + state.stats.losses + state.stats.draws;
    if (!n) return 0;
    return Math.round((state.stats.wins / n) * 100);
  }

  function formatRelative(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'À l\'instant';
    const m = Math.floor(s / 60);
    if (m < 60) return 'Il y a ' + m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return 'Il y a ' + h + ' h';
    const d = Math.floor(h / 24);
    if (d === 1) return 'Hier';
    if (d < 7) return 'Il y a ' + d + ' j';
    return new Date(ts).toLocaleDateString('fr-FR');
  }

  function modeLabel(mode, aiDiff) {
    if (mode === 'ai') {
      const t = AI_OPPONENTS[aiDiff];
      return t ? 'Solo · ' + t.title : 'Solo';
    }
    if (mode === 'local') return 'Local';
    if (mode === 'online') return 'En ligne';
    return mode;
  }

  function outcomeLabel(result) {
    if (result === 'win') return 'Victoire';
    if (result === 'loss') return 'Défaite';
    return 'Nulle';
  }

  function aiOpponent(diff) {
    return AI_OPPONENTS[diff] || AI_OPPONENTS[1];
  }

  function opponentMeta(mode, diff) {
    if (mode === 'ai') return aiOpponent(diff);
    if (mode === 'local') return LOCAL_OPP;
    if (_onlineOpp) {
      return {
        name: _onlineOpp.name || ONLINE_OPP.name,
        avatar: _onlineOpp.avatar || ONLINE_OPP.avatar,
        flag: _onlineOpp.flag || ONLINE_OPP.flag,
        elo: Number(_onlineOpp.elo) || ELO_START
      };
    }
    return ONLINE_OPP;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  load();

  return {
    AVATARS,
    COUNTRIES,
    AI_OPPONENTS,
    ELO_START,
    get,
    load,
    save,
    token,
    applySnapshot,
    ensureSession,
    pushProfile,
    postMatch,
    fetchLeaderboard,
    setOnlineOpponent,
    onlineOpponent,
    displayName,
    countryOf,
    updateProfile,
    recordMatch,
    winRate,
    formatRelative,
    modeLabel,
    outcomeLabel,
    aiOpponent,
    opponentMeta,
    esc
  };
})();

window.Profile = Profile;
