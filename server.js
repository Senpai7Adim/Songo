require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

//IFOU FOPA ANGE - 24G2205
const P1S = 6, P2S = 13;
const P1 = [0, 1, 2, 3, 4, 5];
const P2 = [7, 8, 9, 10, 11, 12];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.json({ limit: '96kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/doc', '/doc/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Documentation', 'songo-documentation.html'));
});

function tokenFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (req.body && req.body.token) return String(req.body.token);
  if (req.query && req.query.token) return String(req.query.token);
  return '';
}

async function requirePlayer(req, res, next) {
  try {
    const player = await db.getByToken(tokenFromReq(req));
    if (!player) return res.status(401).json({ ok: false, error: 'Session invalide' });
    req.player = player;
    req.token = tokenFromReq(req);
    next();
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
}

app.post('/api/session', async (req, res) => {
  try {
    const incoming = req.body && req.body.token;
    const { token, player, created } = await db.getOrCreateByToken(incoming);
    let imported = false;
    if ((created || (player && player.stats.games === 0)) && req.body && req.body.seed) {
      const result = await db.importLegacy(token, req.body.seed);
      if (result && result.imported) imported = true;
    }
    const fresh = await db.getByToken(token);
    const targetPlayer = fresh || player;
    const matches = await db.listMatches(targetPlayer ? targetPlayer.id : null);
    res.json({
      ok: true,
      token,
      created: !!created,
      imported,
      player: targetPlayer,
      matches
    });
  } catch (err) {
    console.error('Session error:', err);
    res.status(500).json({ ok: false, error: 'Erreur session' });
  }
});

app.get('/api/me', requirePlayer, async (req, res) => {
  try {
    const matches = await db.listMatches(req.player.id);
    res.json({ ok: true, player: req.player, matches });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur chargement profil' });
  }
});

app.put('/api/me', requirePlayer, async (req, res) => {
  try {
    const player = await db.updateProfile(req.token, {
      name: req.body && req.body.name,
      avatar: req.body && req.body.avatar,
      country: req.body && req.body.country
    });
    res.json({ ok: true, player });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur mise à jour profil' });
  }
});

app.post('/api/matches', requirePlayer, async (req, res) => {
  try {
    const result = await db.recordClientMatch(req.token, req.body || {});
    if (!result) return res.status(401).json({ ok: false, error: 'Session invalide' });
    if (result.error) return res.status(400).json({ ok: false, error: result.error });
    const matches = await db.listMatches(result.player.id);
    res.json({ ok: true, ...result, matches });
  } catch (err) {
    console.error('Record match error:', err);
    res.status(500).json({ ok: false, error: 'Erreur enregistrement partie' });
  }
});

app.get('/api/matches', requirePlayer, async (req, res) => {
  try {
    const matches = await db.listMatches(req.player.id);
    res.json({ ok: true, matches });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur récupération parties' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const player = await db.getByToken(tokenFromReq(req));
    const lb = await db.leaderboard(20, player && player.id);
    res.json({ ok: true, ...lb });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ ok: false, error: 'Erreur classement' });
  }
});

app.get('/api/health', (_req, res) => {
  const isConnected = db.mongoose && db.mongoose.connection.readyState === 1;
  res.json({ ok: true, db: isConnected });
});

const rooms = new Map();
const DISCONNECT_GRACE_MS = 90000;

async function accountOf(socket) {
  if (!socket.data.account) return null;
  const id = socket.data.account.id || socket.data.account._id;
  const fresh = await db.getById(id);
  return fresh || socket.data.account;
}

async function bindAccount(socket, token) {
  const player = await db.getByToken(token);
  socket.data.account = player;
  return player;
}

function clearDisconnectTimer(room) {
  if (!room) return;
  if (room.disconnectTimer) {
    clearTimeout(room.disconnectTimer);
    room.disconnectTimer = null;
  }
  room.disconnectedSlot = null;
  room.graceEndsAt = null;
  room.paused = false;
}

async function persistRoomResult(room, winner, reason) {
  if (!room || room.recorded) return null;
  room.recorded = true;
  const scores = { p1: room.B[P1S], p2: room.B[P2S] };
  try {
    const payload = await db.recordOnlineResult({
      p1: room.accounts[1],
      p2: room.accounts[2],
      scores,
      winner,
      reason: reason || 'normal',
      roomCode: room.code,
      gameNo: room.gameNo || 0
    });
    io.to(room.code).emit('match_result', payload);
    return payload;
  } catch (err) {
    console.error('persistRoomResult error:', err);
    return null;
  }
}

function endRoom(room, reason) {
  if (!room) return;
  clearDisconnectTimer(room);
  if (!room.over) {
    const remaining = room.players[1] ? 1 : (room.players[2] ? 2 : 0);
    if (remaining) {
      persistRoomResult(room, remaining, reason === 'timeout' ? 'forfeit-timeout' : 'forfeit');
    }
  }
  room.over = true;
  io.to(room.code).emit('opponent_left', { reason });
  broadcastRoom(room);
}

function startDisconnectGrace(room, slot) {
  clearDisconnectTimer(room);
  room.paused = true;
  room.disconnectedSlot = slot;
  room.graceEndsAt = Date.now() + DISCONNECT_GRACE_MS;
  room.disconnectTimer = setTimeout(() => {
    const r = rooms.get(room.code);
    if (!r || r.over) return;
    endRoom(r, 'timeout');
  }, DISCONNECT_GRACE_MS);
  io.to(room.code).emit('player_disconnected', {
    slot,
    graceMs: DISCONNECT_GRACE_MS,
    graceEndsAt: room.graceEndsAt
  });
  broadcastRoom(room);
}

function newBoard() {
  const B = Array(14).fill(4);
  B[P1S] = 0;
  B[P2S] = 0;
  return B;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function nx(i, p) {
  let n = (i + 1) % 14;
  if (p === 1 && n === P2S) n = 0;
  if (p === 2 && n === P1S) n = 7;
  return n;
}

function own(i, p) {
  return p === 1 ? P1.includes(i) : P2.includes(i);
}

function gs(p) {
  return p === 1 ? P1S : P2S;
}

function opp(i) {
  return 12 - i;
}

function applyMove(B, pi, p) {
  let s = B[pi];
  if (!s || !own(pi, p)) return { ok: false };
  B[pi] = 0;
  let c = pi;
  while (s--) { c = nx(c, p); B[c]++; }
  const extra = c === gs(p);
  let captured = 0;
  if (!extra && own(c, p) && B[c] === 1) {
    const o = opp(c);
    if (B[o] > 0) {
      captured = B[o] + 1;
      B[gs(p)] += captured;
      B[c] = 0;
      B[o] = 0;
    }
  }
  return { ok: true, extra, captured, lastPit: c };
}

function checkEnd(B) {
  const s1 = P1.reduce((a, i) => a + B[i], 0);
  const s2 = P2.reduce((a, i) => a + B[i], 0);
  if (!s1 || !s2) {
    P1.forEach(i => { B[P1S] += B[i]; B[i] = 0; });
    P2.forEach(i => { B[P2S] += B[i]; B[i] = 0; });
    return { over: true, scores: { p1: B[P1S], p2: B[P2S] } };
  }
  return { over: false };
}

function roomState(room, lastMove) {
  const b = [...room.B];
  const p1score = b[P1S];
  const p2score = b[P2S];
  let winner = null;
  if (room.over) {
    if (p1score > p2score) winner = 1;
    else if (p2score > p1score) winner = 2;
    else winner = 0;
  }
  return {
    code: room.code,
    board: b,
    scores: { p1: p1score, p2: p2score },
    currentPlayer: room.turn,
    lastMove: lastMove || null,
    winner,
    over: room.over,
    moveSeq: room.moveSeq,
    paused: !!room.paused,
    disconnectedSlot: room.disconnectedSlot || null,
    graceEndsAt: room.graceEndsAt || null,
    players: { 1: !!room.players[1], 2: !!room.players[2] },
    profiles: {
      1: db.publicProfile(room.accounts[1]),
      2: db.publicProfile(room.accounts[2])
    },
    drawOffer: room.drawOffer || null
  };
}

function broadcastRoom(room, lastMove) {
  io.to(room.code).emit('gameState', roomState(room, lastMove || null));
}

async function attachPlayer(socket, room, slot) {
  room.players[slot] = socket.id;
  room.accounts[slot] = await accountOf(socket);
  socket.join(room.code);
  socket.data.room = room.code;
  socket.data.player = slot;
}

function detachSocket(socket) {
  const code = socket.data.room;
  const slot = socket.data.player;
  if (!code) return { room: null, slot: null };
  const room = rooms.get(code);
  if (room) {
    if (room.players[1] === socket.id) room.players[1] = null;
    if (room.players[2] === socket.id) room.players[2] = null;
  }
  socket.leave(code);
  socket.data.room = null;
  socket.data.player = null;
  return { room, slot };
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      await bindAccount(socket, token);
    } catch (e) {
      // Continue as guest if token fails
    }
  }
  next();
});

io.on('connection', (socket) => {
  socket.on('identify', async (token, cb) => {
    try {
      const player = await bindAccount(socket, token);
      if (typeof cb === 'function') cb({ ok: !!player, player: db.publicProfile(player) });
    } catch (e) {
      if (typeof cb === 'function') cb({ ok: false });
    }
  });

  socket.on('ping_check', (cb) => {
    if (typeof cb === 'function') cb();
  });

  socket.on('create', async (cb) => {
    detachSocket(socket);
    let code;
    do { code = genCode(); } while (rooms.has(code));
    const room = {
      code,
      B: newBoard(),
      turn: 1,
      over: false,
      moveSeq: 0,
      gameNo: 0,
      recorded: false,
      paused: false,
      disconnectedSlot: null,
      graceEndsAt: null,
      disconnectTimer: null,
      drawOffer: null,
      players: { 1: null, 2: null },
      accounts: { 1: null, 2: null }
    };
    rooms.set(code, room);
    await attachPlayer(socket, room, 1);
    const state = roomState(room);
    if (typeof cb === 'function') cb({ ok: true, code, player: 1, state });
    broadcastRoom(room);
  });

  socket.on('join', async (code, cb) => {
    detachSocket(socket);
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Salle introuvable' });
    if (!room.players[1]) return typeof cb === 'function' && cb({ ok: false, error: 'Salle invalide' });
    if (room.over) return typeof cb === 'function' && cb({ ok: false, error: 'Partie terminée' });
    if (room.paused && room.disconnectedSlot === 2) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Joueur 2 déconnecté — il peut revenir avec le même code' });
    }
    if (room.players[2] && room.players[2] !== socket.id) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Salle pleine' });
    }
    await attachPlayer(socket, room, 2);
    clearDisconnectTimer(room);
    const state = roomState(room);
    if (typeof cb === 'function') cb({ ok: true, code: room.code, player: 2, state });
    broadcastRoom(room);
  });

  socket.on('rejoin', async (code, player, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    const slot = Number(player);
    if (!room || (slot !== 1 && slot !== 2)) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Salle introuvable' });
    }
    if (slot === 1 && room.players[1] && room.players[1] !== socket.id) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Place déjà prise' });
    }
    if (slot === 2 && room.players[2] && room.players[2] !== socket.id) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Place déjà prise' });
    }
    if (room.over) return typeof cb === 'function' && cb({ ok: false, error: 'Partie terminée' });
    const wasReconnect = room.paused && room.disconnectedSlot === slot;
    await attachPlayer(socket, room, slot);
    if (wasReconnect) {
      clearDisconnectTimer(room);
      io.to(room.code).emit('player_rejoined', { slot });
    }
    if (typeof cb === 'function') cb({ ok: true, player: slot, state: roomState(room) });
    broadcastRoom(room);
  });

  socket.on('move', async (pit, cb) => {
    const pitIdx = Number(pit);
    const code = socket.data.room;
    const room = code && rooms.get(code);
    const player = socket.data.player;
    const fail = (error) => typeof cb === 'function' && cb({ ok: false, error });

    if (!room) return fail('Pas de salle — rejoignez la partie');
    if (room.over) return fail('Partie terminée');
    if (room.paused) return fail('Partie en pause — adversaire déconnecté');
    if (!room.players[1] || !room.players[2]) return fail('Adversaire absent');
    if (!player) return fail('Joueur non identifié');
    if (room.players[player] !== socket.id) return fail('Session expirée — rejoignez la salle');
    if (room.turn !== player) return fail('Pas votre tour');
    if (!Number.isInteger(pitIdx) || !own(pitIdx, player) || !room.B[pitIdx]) {
      return fail('Coup invalide');
    }

    const seeds = room.B[pitIdx];
    const result = applyMove(room.B, pitIdx, player);
    if (!result.ok) return fail('Coup invalide');

    const end = checkEnd(room.B);
    if (!end.over && !result.extra) room.turn = player === 1 ? 2 : 1;
    if (end.over) {
      room.over = true;
      room.drawOffer = null;
      const winner = end.scores.p1 > end.scores.p2 ? 1 : end.scores.p2 > end.scores.p1 ? 2 : 0;
      await persistRoomResult(room, winner, 'normal');
    }

    room.moveSeq += 1;
    const lastMove = {
      seq: room.moveSeq,
      pit: pitIdx,
      player,
      seeds,
      extra: result.extra,
      captured: result.captured,
      lastPit: result.lastPit
    };

    broadcastRoom(room, lastMove);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('draw_offer', async (cb) => {
    const room = socket.data.room && rooms.get(socket.data.room);
    const player = socket.data.player;
    const fail = (error) => typeof cb === 'function' && cb({ ok: false, error });
    if (!room || !player) return fail('Pas de salle');
    if (room.over || room.paused) return fail('Partie indisponible');
    if (room.drawOffer && room.drawOffer !== player) {
      room.over = true;
      await persistRoomResult(room, 0, 'draw');
      broadcastRoom(room);
      return typeof cb === 'function' && cb({ ok: true, accepted: true });
    }
    room.drawOffer = player;
    io.to(room.code).emit('draw_offered', { slot: player });
    broadcastRoom(room);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('draw_respond', async (accept, cb) => {
    const room = socket.data.room && rooms.get(socket.data.room);
    const player = socket.data.player;
    const fail = (error) => typeof cb === 'function' && cb({ ok: false, error });
    if (!room || !player) return fail('Pas de salle');
    if (!room.drawOffer || room.drawOffer === player) return fail('Aucune proposition');
    if (accept) {
      room.over = true;
      room.drawOffer = null;
      await persistRoomResult(room, 0, 'draw');
      broadcastRoom(room);
    } else {
      room.drawOffer = null;
      io.to(room.code).emit('draw_declined', { slot: player });
      broadcastRoom(room);
    }
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('rematch', async () => {
    const code = socket.data.room;
    const room = code && rooms.get(code);
    if (!room || !room.players[1] || !room.players[2] || room.paused) return;
    clearDisconnectTimer(room);
    room.B = newBoard();
    room.turn = 1;
    room.over = false;
    room.moveSeq = 0;
    room.gameNo = (room.gameNo || 0) + 1;
    room.recorded = false;
    room.drawOffer = null;
    room.accounts[1] = room.accounts[1] && (await db.getById(room.accounts[1].id || room.accounts[1]._id));
    room.accounts[2] = room.accounts[2] && (await db.getById(room.accounts[2].id || room.accounts[2]._id));
    broadcastRoom(room);
  });

  socket.on('leave', () => {
    const { room } = detachSocket(socket);
    if (!room) return;
    if (!room.players[1] && !room.players[2]) {
      clearDisconnectTimer(room);
      rooms.delete(room.code);
      return;
    }
    endRoom(room, 'left');
  });

  socket.on('disconnect', () => {
    const { room, slot } = detachSocket(socket);
    if (!room || !slot || room.over) return;
    const other = slot === 1 ? 2 : 1;
    if (!room.players[other]) {
      clearDisconnectTimer(room);
      rooms.delete(room.code);
      return;
    }
    startDisconnectGrace(room, slot);
  });
});

const PORT = process.env.PORT || 3000;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const isWin = process.platform === 'win32';
    const killCmd = isWin
      ? `Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`
      : `kill $(lsof -ti :${PORT})`;
    console.error(`Port ${PORT} déjà utilisé. Pour libérer le port, exécutez :\n  ${killCmd}`);
    process.exit(1);
  }
  throw err;
});

async function start() {
  try {
    await db.connect();
  } catch (err) {
    console.error('Failed to connect to MongoDB at startup:', err.message);
  }
  server.listen(PORT, () => console.log(`Songo server on port ${PORT}`));
}

start();
