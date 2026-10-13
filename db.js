'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns');
const mongoose = require('mongoose');
const { Player, Match } = require('./models');

// If Node is running on Windows or networks with restrictive DNS, SRV lookup may fail.
// Setting public DNS servers ensures Atlas cluster SRV records resolve reliably.
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if not permitted in environment
}

const ELO_START = 1200;
const ELO_MIN = 100;
const ELO_MAX = 3000;
const K = 24;
const MAX_MATCHES = 40;

const AVATARS = new Set([
  '👤', '🧔', '👩', '🧒', '👴', '👵',
  '🦁', '🐆', '🐘', '🦍', '🦅', '🐍',
  '🥁', '🌾', '⭐', '🔥', '👑', '🎯',
  '🪵', '🌙', '☀️', '💎', '🦋', '🎵'
]);

const COUNTRIES = {
  CM: '🇨🇲', TD: '🇹🇩', CG: '🇨🇬', GA: '🇬🇦', GQ: 'GQ', CF: '🇨🇫',
  NG: '🇳🇬', SN: '🇸🇳', CI: '🇨🇮', GH: '🇬🇭', ML: '🇲🇱', BF: '🇧🇫',
  BJ: '🇧🇯', TG: '🇹🇬', GN: '🇬🇳', CD: '🇨🇩', MA: '🇲🇦', DZ: '🇩🇿',
  TN: '🇹🇳', EG: '🇪🇬', ZA: '🇿🇦', KE: '🇰🇪', FR: '🇫🇷', BE: '🇧🇪',
  CA: '🇨🇦', US: '🇺🇸', GB: '🇬🇧', BR: '🇧🇷', HT: '🇭🇹', XX: '🌍'
};

const AI_OPPONENTS = {
  1: { name: 'Kossi', title: 'Débutant', avatar: '😊', elo: 800 },
  2: { name: 'Mireille', title: 'Intermédiaire', avatar: '🧠', elo: 1100 },
  3: { name: 'Njoya', title: 'Expert', avatar: '🔥', elo: 1400 },
  4: { name: 'Sultan', title: 'Maître', avatar: '👑', elo: 1700 }
};

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newId() {
  return crypto.randomUUID();
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function blankAi() {
  return {
    1: { w: 0, l: 0, d: 0 },
    2: { w: 0, l: 0, d: 0 },
    3: { w: 0, l: 0, d: 0 },
    4: { w: 0, l: 0, d: 0 }
  };
}

function parseAi(jsonOrObj) {
  if (!jsonOrObj) return blankAi();
  let raw = jsonOrObj;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return blankAi();
    }
  }
  const out = blankAi();
  for (let i = 1; i <= 4; i++) {
    const b = raw[i] || raw[String(i)] || {};
    out[i] = { w: b.w | 0, l: b.l | 0, d: b.d | 0 };
  }
  return out;
}

function flagOf(country) {
  return COUNTRIES[country] || COUNTRIES.CM;
}

function sanitizeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function sanitizeAvatar(avatar) {
  return AVATARS.has(avatar) ? avatar : '👤';
}

function sanitizeCountry(country) {
  return COUNTRIES[country] ? country : 'CM';
}

function clampElo(n) {
  const e = Number(n);
  if (!Number.isFinite(e)) return ELO_START;
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(e)));
}

function expectedScore(myElo, oppElo) {
  return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
}

function eloDelta(myElo, oppElo, score) {
  return Math.round(K * (score - expectedScore(myElo, oppElo)));
}

function scoreFromResult(result) {
  if (result === 'win') return 1;
  if (result === 'draw') return 0.5;
  return 0;
}

function docToPlayer(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  const country = sanitizeCountry(obj.country);
  const byAi = obj.stats?.byAi ? parseAi(obj.stats.byAi) : blankAi();

  return {
    id: String(obj._id || obj.id),
    name: obj.name || '',
    avatar: sanitizeAvatar(obj.avatar),
    country,
    flag: flagOf(country),
    setupDone: !!obj.setupDone,
    elo: obj.elo != null ? obj.elo : ELO_START,
    eloPeak: obj.eloPeak != null ? obj.eloPeak : ELO_START,
    stats: {
      wins: obj.stats?.wins || 0,
      losses: obj.stats?.losses || 0,
      draws: obj.stats?.draws || 0,
      games: obj.stats?.games || 0,
      streak: obj.stats?.streak || 0,
      bestStreak: obj.stats?.bestStreak || 0,
      byAi,
      online: {
        w: obj.stats?.online?.w || 0,
        l: obj.stats?.online?.l || 0,
        d: obj.stats?.online?.d || 0
      },
      local: {
        games: obj.stats?.local?.games || 0
      }
    }
  };
}

function formatMatch(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id || obj.id),
    ts: obj.ts,
    mode: obj.mode,
    result: obj.result,
    yourScore: obj.yourScore | 0,
    oppScore: obj.oppScore | 0,
    oppName: obj.oppName || 'Adversaire',
    oppAvatar: obj.oppAvatar || '👤',
    rated: !!obj.rated,
    eloDelta: obj.eloDelta | 0,
    eloAfter: obj.eloAfter != null ? obj.eloAfter : ELO_START,
    eloBefore: obj.eloBefore != null ? obj.eloBefore : ELO_START,
    aiDiff: obj.aiDiff != null ? obj.aiDiff : null,
    timeControl: obj.timeControl || '∞',
    reason: obj.reason || 'normal'
  };
}

function publicProfile(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name.trim() || 'Joueur',
    avatar: player.avatar,
    country: player.country,
    flag: player.flag,
    elo: player.elo
  };
}

async function migrateFromSqliteIfNeeded() {
  const sqliteFile = process.env.SONGO_DB || path.join(__dirname, 'data', 'songo.db');
  if (!fs.existsSync(sqliteFile)) return;

  try {
    const count = await Player.countDocuments();
    if (count > 0) return; // Database already contains records

    console.log('Migrating data from SQLite to MongoDB...');
    const { DatabaseSync } = require('node:sqlite');
    const sqlite = new DatabaseSync(sqliteFile);

    const rows = sqlite.prepare('SELECT * FROM players').all();
    for (const r of rows) {
      await Player.create({
        _id: r.id,
        tokenHash: r.token_hash,
        name: r.name || '',
        avatar: r.avatar || '👤',
        country: r.country || 'CM',
        elo: r.elo || 1200,
        eloPeak: r.elo_peak || 1200,
        setupDone: !!r.setup_done,
        stats: {
          wins: r.wins || 0,
          losses: r.losses || 0,
          draws: r.draws || 0,
          games: r.games || 0,
          streak: r.streak || 0,
          bestStreak: r.best_streak || 0,
          byAi: parseAi(r.ai_json),
          online: { w: r.online_w || 0, l: r.online_l || 0, d: r.online_d || 0 },
          local: { games: r.local_games || 0 }
        },
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      });
    }

    const matches = sqlite.prepare('SELECT * FROM matches').all();
    for (const m of matches) {
      await Match.create({
        _id: m.id,
        playerId: m.player_id,
        opponentId: m.opponent_id || null,
        roomCode: m.room_code || null,
        gameNo: m.game_no == null ? null : m.game_no,
        mode: m.mode,
        result: m.result,
        yourScore: m.your_score || 0,
        oppScore: m.opp_score || 0,
        oppName: m.opp_name || 'Adversaire',
        oppAvatar: m.opp_avatar || '👤',
        rated: !!m.rated,
        eloDelta: m.elo_delta || 0,
        eloBefore: m.elo_before || 1200,
        eloAfter: m.elo_after || 1200,
        aiDiff: m.ai_diff == null ? null : m.ai_diff,
        timeControl: m.time_control || '∞',
        reason: m.reason || 'normal',
        ts: m.ts
      });
    }

    console.log(`Successfully migrated ${rows.length} players and ${matches.length} matches from SQLite.`);
  } catch (err) {
    console.warn('SQLite migration note:', err.message);
  }
}

async function connect(uri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/songo';
  const dbName = process.env.MONGODB_DB || 'songo';

  await mongoose.connect(mongoUri, {
    dbName,
    serverSelectionTimeoutMS: 10000
  });

  console.log(`Connected to MongoDB database "${dbName}"`);
  await migrateFromSqliteIfNeeded();
  return mongoose.connection;
}

// Alias open to connect for backward compatibility
const open = connect;

async function getById(id) {
  if (!id) return null;
  const doc = await Player.findById(id);
  return docToPlayer(doc);
}

async function getByToken(token) {
  if (!token || String(token).length < 16) return null;
  const doc = await Player.findOne({ tokenHash: hashToken(token) });
  return docToPlayer(doc);
}

async function createPlayer() {
  const id = newId();
  const token = newToken();
  const doc = await Player.create({
    _id: id,
    tokenHash: hashToken(token),
    name: '',
    avatar: '👤',
    country: 'CM',
    elo: ELO_START,
    eloPeak: ELO_START,
    setupDone: false,
    stats: {
      wins: 0,
      losses: 0,
      draws: 0,
      games: 0,
      streak: 0,
      bestStreak: 0,
      byAi: blankAi(),
      online: { w: 0, l: 0, d: 0 },
      local: { games: 0 }
    }
  });
  return { token, player: docToPlayer(doc) };
}

async function getOrCreateByToken(token) {
  if (token && String(token).length >= 16) {
    const existing = await getByToken(token);
    if (existing) return { token, player: existing, created: false };
  }
  const created = await createPlayer();
  return { ...created, created: true };
}

async function updateProfile(token, { name, avatar, country }) {
  if (!token || String(token).length < 16) return null;
  const doc = await Player.findOne({ tokenHash: hashToken(token) });
  if (!doc) return null;

  if (name !== undefined) doc.name = sanitizeName(name);
  if (avatar !== undefined) doc.avatar = sanitizeAvatar(avatar);
  if (country !== undefined) doc.country = sanitizeCountry(country);
  doc.setupDone = true;

  await doc.save();
  return docToPlayer(doc);
}

function bumpStatsDoc(p, { mode, result, rated, aiDiff }) {
  p.stats.games++;
  if (mode === 'local') {
    p.stats.local.games++;
    return;
  }
  if (!rated) return;
  if (result === 'win') {
    p.stats.wins++;
    p.stats.streak = p.stats.streak >= 0 ? p.stats.streak + 1 : 1;
  } else if (result === 'loss') {
    p.stats.losses++;
    p.stats.streak = p.stats.streak <= 0 ? p.stats.streak - 1 : -1;
  } else {
    p.stats.draws++;
    p.stats.streak = 0;
  }
  if (result === 'win' && p.stats.streak > p.stats.bestStreak) {
    p.stats.bestStreak = p.stats.streak;
  }
  if (mode === 'ai' && aiDiff && p.stats.byAi) {
    const diffKey = String(aiDiff);
    if (!p.stats.byAi[diffKey]) {
      p.stats.byAi[diffKey] = { w: 0, l: 0, d: 0 };
    }
    const b = p.stats.byAi[diffKey];
    if (result === 'win') b.w++;
    else if (result === 'loss') b.l++;
    else b.d++;
    p.markModified('stats.byAi');
  }
  if (mode === 'online') {
    if (result === 'win') p.stats.online.w++;
    else if (result === 'loss') p.stats.online.l++;
    else p.stats.online.d++;
  }
}

function applyRatedResultDoc(p, oppElo, result) {
  const delta = eloDelta(p.elo, oppElo, scoreFromResult(result));
  const eloBefore = p.elo;
  p.elo = clampElo(p.elo + delta);
  if (p.elo > p.eloPeak) p.eloPeak = p.elo;
  return { delta, eloBefore, eloAfter: p.elo };
}

async function listMatches(playerId, limit) {
  if (!playerId) return [];
  const rows = await Match.find({ playerId })
    .sort({ ts: -1 })
    .limit(limit || MAX_MATCHES)
    .lean();
  return rows.map(formatMatch);
}

async function recordClientMatch(token, opts) {
  if (!token || String(token).length < 16) return null;
  const pDoc = await Player.findOne({ tokenHash: hashToken(token) });
  if (!pDoc) return null;

  const mode = opts.mode === 'local' || opts.mode === 'online' ? opts.mode : 'ai';
  if (mode === 'online') {
    return { error: 'Les parties en ligne sont enregistrées par le serveur' };
  }
  const result = opts.result === 'win' || opts.result === 'loss' ? opts.result : 'draw';
  const rated = mode === 'ai';
  const aiDiff = mode === 'ai' ? Math.min(4, Math.max(1, opts.aiDiff | 0 || 1)) : null;
  const opp = mode === 'ai' ? (AI_OPPONENTS[aiDiff] || AI_OPPONENTS[1]) : {
    name: 'Joueur 2', avatar: '👥', elo: ELO_START
  };
  const oppElo = mode === 'ai' ? opp.elo : ELO_START;
  let delta = 0;
  let eloBefore = pDoc.elo;

  bumpStatsDoc(pDoc, { mode, result, rated, aiDiff });
  if (rated) {
    const applied = applyRatedResultDoc(pDoc, oppElo, result);
    delta = applied.delta;
    eloBefore = applied.eloBefore;
  }

  const matchId = newId();
  const matchData = {
    _id: matchId,
    playerId: pDoc._id,
    mode,
    result,
    yourScore: opts.yourScore | 0,
    oppScore: opts.oppScore | 0,
    oppName: opts.oppName || (mode === 'ai' ? opp.name + ' · ' + opp.title : opp.name),
    oppAvatar: opts.oppAvatar || opp.avatar,
    rated,
    eloDelta: delta,
    eloAfter: pDoc.elo,
    eloBefore,
    aiDiff,
    timeControl: String(opts.timeControl || '∞').slice(0, 12),
    reason: String(opts.reason || 'normal').slice(0, 32),
    ts: Date.now()
  };

  await pDoc.save();
  const createdMatch = await Match.create(matchData);

  return {
    player: docToPlayer(pDoc),
    match: formatMatch(createdMatch),
    eloDelta: delta,
    newElo: pDoc.elo,
    rated
  };
}

async function recordOnlineResult({ p1, p2, scores, winner, reason, roomCode, gameNo }) {
  const results = { 1: null, 2: null };
  const p1Id = p1 && (p1.id || p1._id || p1);
  const p2Id = p2 && (p2.id || p2._id || p2);

  const p1Doc = p1Id ? await Player.findById(p1Id) : null;
  const p2Doc = p2Id ? await Player.findById(p2Id) : null;

  const elo1 = p1Doc ? p1Doc.elo : ELO_START;
  const elo2 = p2Doc ? p2Doc.elo : ELO_START;

  async function side(slot) {
    const meDoc = slot === 1 ? p1Doc : p2Doc;
    const oppDoc = slot === 1 ? p2Doc : p1Doc;
    const oppPub = p1 && p2 ? (slot === 1 ? p2 : p1) : null;
    const result = winner === 0 ? 'draw' : (winner === slot ? 'win' : 'loss');
    const yourScore = slot === 1 ? scores.p1 : scores.p2;
    const oppScore = slot === 1 ? scores.p2 : scores.p1;
    const oppElo = slot === 1 ? elo2 : elo1;
    let delta = 0;
    let eloBefore = meDoc ? meDoc.elo : ELO_START;
    let eloAfter = eloBefore;

    if (meDoc) {
      bumpStatsDoc(meDoc, { mode: 'online', result, rated: true, aiDiff: null });
      const applied = applyRatedResultDoc(meDoc, oppElo, result);
      delta = applied.delta;
      eloBefore = applied.eloBefore;
      eloAfter = applied.eloAfter;

      const match = {
        _id: newId(),
        playerId: meDoc._id,
        opponentId: oppDoc ? oppDoc._id : null,
        roomCode: roomCode || null,
        gameNo: gameNo == null ? null : gameNo,
        ts: Date.now(),
        mode: 'online',
        result,
        yourScore,
        oppScore,
        oppName: (oppDoc && (oppDoc.name || '').trim()) || (oppPub && oppPub.name) || 'Adversaire',
        oppAvatar: (oppDoc && oppDoc.avatar) || (oppPub && oppPub.avatar) || '👤',
        rated: true,
        eloDelta: delta,
        eloAfter,
        eloBefore,
        aiDiff: null,
        timeControl: '∞',
        reason
      };

      try {
        await Match.create(match);
      } catch (err) {
        if (err.code === 11000) {
          return {
            result,
            eloDelta: 0,
            newElo: meDoc.elo,
            rated: true,
            duplicate: true,
            player: docToPlayer(meDoc)
          };
        }
        throw err;
      }

      await meDoc.save();
      return {
        result,
        eloDelta: delta,
        newElo: eloAfter,
        rated: true,
        match: formatMatch(match),
        player: docToPlayer(meDoc)
      };
    }

    return {
      result,
      eloDelta: 0,
      newElo: ELO_START,
      rated: false,
      yourScore,
      oppScore
    };
  }

  results[1] = await side(1);
  results[2] = await side(2);
  return { winner, scores, reason, bySlot: results };
}

async function importLegacy(token, payload) {
  if (!token || String(token).length < 16) return null;
  const pDoc = await Player.findOne({ tokenHash: hashToken(token) });
  if (!pDoc) return null;
  if (pDoc.stats.games > 0) return { player: docToPlayer(pDoc), imported: false };

  if (payload.elo != null) pDoc.elo = clampElo(payload.elo);
  if (payload.eloPeak != null) pDoc.eloPeak = clampElo(payload.eloPeak);
  if (pDoc.elo > pDoc.eloPeak) pDoc.eloPeak = pDoc.elo;
  if (payload.name) pDoc.name = sanitizeName(payload.name);
  if (payload.avatar) pDoc.avatar = sanitizeAvatar(payload.avatar);
  if (payload.country) pDoc.country = sanitizeCountry(payload.country);
  pDoc.setupDone = true;

  const s = payload.stats || {};
  pDoc.stats.wins = s.wins | 0;
  pDoc.stats.losses = s.losses | 0;
  pDoc.stats.draws = s.draws | 0;
  pDoc.stats.games = s.games | 0;
  pDoc.stats.streak = s.streak | 0;
  pDoc.stats.bestStreak = s.bestStreak | 0;

  if (s.byAi) {
    pDoc.stats.byAi = parseAi(s.byAi);
    pDoc.markModified('stats.byAi');
  }
  if (s.online) {
    pDoc.stats.online = { w: s.online.w | 0, l: s.online.l | 0, d: s.online.d | 0 };
  }
  if (s.local) {
    pDoc.stats.local = { games: s.local.games | 0 };
  }

  await pDoc.save();

  const matches = Array.isArray(payload.matches) ? payload.matches.slice(0, MAX_MATCHES) : [];
  for (const m of matches) {
    try {
      await Match.create({
        _id: newId(),
        playerId: pDoc._id,
        ts: Number(m.ts) || Date.now(),
        mode: m.mode === 'online' || m.mode === 'local' ? m.mode : 'ai',
        result: m.result === 'win' || m.result === 'loss' ? m.result : 'draw',
        yourScore: m.yourScore | 0,
        oppScore: m.oppScore | 0,
        oppName: String(m.oppName || 'Adversaire').slice(0, 40),
        oppAvatar: String(m.oppAvatar || '👤').slice(0, 8),
        rated: !!m.rated,
        eloDelta: m.eloDelta | 0,
        eloAfter: clampElo(m.eloAfter || pDoc.elo),
        eloBefore: clampElo(m.eloBefore || pDoc.elo),
        aiDiff: m.aiDiff || null,
        timeControl: String(m.timeControl || '∞').slice(0, 12),
        reason: String(m.reason || 'import').slice(0, 32)
      });
    } catch {
      // Ignore individually malformed matches
    }
  }

  return { player: docToPlayer(pDoc), imported: true };
}

async function leaderboard(limit, playerId) {
  const max = Math.min(50, limit || 20);
  const rows = await Player.find({ 'stats.games': { $gt: 0 } })
    .sort({ elo: -1, 'stats.wins': -1, 'stats.games': 1 })
    .limit(max)
    .lean();

  const list = rows.map((r, i) => {
    const country = sanitizeCountry(r.country);
    const wins = r.stats?.wins || 0;
    const losses = r.stats?.losses || 0;
    const draws = r.stats?.draws || 0;
    const total = wins + losses + draws;

    return {
      rank: i + 1,
      id: String(r._id),
      name: (r.name || '').trim() || 'Joueur',
      avatar: sanitizeAvatar(r.avatar),
      country,
      flag: flagOf(country),
      elo: r.elo,
      wins,
      losses,
      draws,
      games: r.stats?.games || 0,
      winRate: total ? Math.round((wins / total) * 100) : 0
    };
  });

  let me = null;
  if (playerId) {
    me = list.find((x) => x.id === playerId) || null;
    if (!me) {
      const mine = await getById(playerId);
      if (mine && mine.stats.games > 0) {
        const betterCount = await Player.countDocuments({
          'stats.games': { $gt: 0 },
          $or: [
            { elo: { $gt: mine.elo } },
            { elo: mine.elo, 'stats.wins': { $gt: mine.stats.wins } }
          ]
        });
        const total = mine.stats.wins + mine.stats.losses + mine.stats.draws;
        me = {
          rank: betterCount + 1,
          id: mine.id,
          name: mine.name.trim() || 'Joueur',
          avatar: mine.avatar,
          country: mine.country,
          flag: mine.flag,
          elo: mine.elo,
          wins: mine.stats.wins,
          losses: mine.stats.losses,
          draws: mine.stats.draws,
          games: mine.stats.games,
          winRate: total ? Math.round((mine.stats.wins / total) * 100) : 0
        };
      }
    }
  }

  return { list, me };
}

module.exports = {
  ELO_START,
  AVATARS,
  AI_OPPONENTS,
  open,
  connect,
  getByToken,
  getById,
  getOrCreateByToken,
  createPlayer,
  updateProfile,
  publicProfile,
  recordClientMatch,
  recordOnlineResult,
  listMatches,
  importLegacy,
  leaderboard,
  sanitizeName,
  sanitizeAvatar,
  sanitizeCountry,
  flagOf,
  Player,
  Match,
  mongoose
};
