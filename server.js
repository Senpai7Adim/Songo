const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

app.use(express.static(path.join(__dirname, 'public')));

app.get(['/doc', '/doc/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Documentation', 'songo-documentation.html'));
});

const rooms = new Map();
const DISCONNECT_GRACE_MS = 90000;

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

function endRoom(room, reason) {
  if (!room) return;
  clearDisconnectTimer(room);
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
    else winner = 0; // égalité
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
    players: { 1: !!room.players[1], 2: !!room.players[2] }
  };
}

function broadcastRoom(room, lastMove) {
  io.to(room.code).emit('gameState', roomState(room, lastMove || null));
}

function attachPlayer(socket, room, slot) {
  room.players[slot] = socket.id;
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

io.on('connection', (socket) => {
  socket.on('create', (cb) => {
    detachSocket(socket);
    let code;
    do { code = genCode(); } while (rooms.has(code));
    const room = {
      code,
      B: newBoard(),
      turn: 1,
      over: false,
      moveSeq: 0,
      paused: false,
      disconnectedSlot: null,
      graceEndsAt: null,
      disconnectTimer: null,
      players: { 1: null, 2: null }
    };
    rooms.set(code, room);
    attachPlayer(socket, room, 1);
    const state = roomState(room);
    if (typeof cb === 'function') cb({ ok: true, code, player: 1, state });
    broadcastRoom(room);
  });

  socket.on('join', (code, cb) => {
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
    attachPlayer(socket, room, 2);
    clearDisconnectTimer(room);
    const state = roomState(room);
    if (typeof cb === 'function') cb({ ok: true, code: room.code, player: 2, state });
    broadcastRoom(room);
  });

  socket.on('rejoin', (code, player, cb) => {
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
    attachPlayer(socket, room, slot);
    if (wasReconnect) {
      clearDisconnectTimer(room);
      io.to(room.code).emit('player_rejoined', { slot });
    }
    if (typeof cb === 'function') cb({ ok: true, player: slot, state: roomState(room) });
    broadcastRoom(room);
  });

  socket.on('move', (pit, cb) => {
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
    if (end.over) room.over = true;

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

  socket.on('rematch', () => {
    const code = socket.data.room;
    const room = code && rooms.get(code);
    if (!room || !room.players[1] || !room.players[2] || room.paused) return;
    clearDisconnectTimer(room);
    room.B = newBoard();
    room.turn = 1;
    room.over = false;
    room.moveSeq = 0;
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
    console.error(`Port ${PORT} déjà utilisé. Arrêtez l'autre processus : kill $(lsof -ti :${PORT})`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, () => console.log(`Songo server on port ${PORT}`));
