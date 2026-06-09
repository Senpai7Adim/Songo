const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const P1S = 6, P2S = 13;
const P1 = [0, 1, 2, 3, 4, 5];
const P2 = [7, 8, 9, 10, 11, 12];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

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
  const seeds = B[pi];
  if (!seeds || !own(pi, p)) return { ok: false };
  B[pi] = 0;
  let c = pi;
  while (seeds--) { c = nx(c, p); B[c]++; }
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

function roomState(room) {
  return {
    code: room.code,
    B: room.B,
    turn: room.turn,
    over: room.over,
    scores: room.over ? { p1: room.B[P1S], p2: room.B[P2S] } : null,
    players: {
      1: !!room.players[1],
      2: !!room.players[2]
    }
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('state', roomState(room));
}

io.on('connection', (socket) => {
  socket.on('create', (cb) => {
    const prev = socket.data.room;
    if (prev) {
      const old = rooms.get(prev);
      if (old) {
        if (old.players[1] === socket.id) old.players[1] = null;
        if (old.players[2] === socket.id) old.players[2] = null;
        if (!old.players[1] && !old.players[2]) rooms.delete(prev);
      }
      socket.leave(prev);
    }
    let code;
    do { code = genCode(); } while (rooms.has(code));
    const room = {
      code,
      B: newBoard(),
      turn: 1,
      over: false,
      players: { 1: socket.id, 2: null }
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.data.player = 1;
    cb({ ok: true, code, player: 1, state: roomState(room) });
    broadcastRoom(room);
  });

  socket.on('join', (code, cb) => {
    const prev = socket.data.room;
    if (prev) {
      const old = rooms.get(prev);
      if (old) {
        if (old.players[1] === socket.id) old.players[1] = null;
        if (old.players[2] === socket.id) old.players[2] = null;
        if (!old.players[1] && !old.players[2]) rooms.delete(prev);
      }
      socket.leave(prev);
    }
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Salle introuvable' });
    if (room.players[2]) return cb({ ok: false, error: 'Salle pleine' });
    if (room.over) return cb({ ok: false, error: 'Partie terminée' });
    room.players[2] = socket.id;
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.player = 2;
    cb({ ok: true, code: room.code, player: 2, state: roomState(room) });
    broadcastRoom(room);
  });

  socket.on('move', (pit, cb) => {
    const code = socket.data.room;
    const room = code && rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'Pas de salle' });
    if (room.over) return cb && cb({ ok: false, error: 'Partie terminée' });
    const player = socket.data.player;
    if (room.turn !== player) return cb && cb({ ok: false, error: 'Pas votre tour' });
    if (!own(pit, player) || !room.B[pit]) return cb && cb({ ok: false, error: 'Coup invalide' });

    const seeds = room.B[pit];
    const result = applyMove(room.B, pit, player);
    if (!result.ok) return cb && cb({ ok: false, error: 'Coup invalide' });

    const end = checkEnd(room.B);
    if (end.over) {
      room.over = true;
      io.to(code).emit('move', {
        pit, player, seeds, ...result,
        turn: room.turn, over: true,
        B: [...room.B], scores: end.scores
      });
      return cb && cb({ ok: true });
    }

    if (!result.extra) room.turn = player === 1 ? 2 : 1;
    io.to(code).emit('move', {
      pit, player, seeds, ...result,
      turn: room.turn, over: false, B: [...room.B]
    });
    cb && cb({ ok: true });
  });

  socket.on('rematch', () => {
    const code = socket.data.room;
    const room = code && rooms.get(code);
    if (!room || !room.players[1] || !room.players[2]) return;
    room.B = newBoard();
    room.turn = 1;
    room.over = false;
    broadcastRoom(room);
  });

  socket.on('leave', () => {
    const code = socket.data.room;
    if (!code) return;
    const room = rooms.get(code);
    if (room) {
      if (room.players[1] === socket.id) room.players[1] = null;
      if (room.players[2] === socket.id) room.players[2] = null;
      socket.leave(code);
      if (!room.players[1] && !room.players[2]) rooms.delete(code);
      else {
        room.over = true;
        io.to(code).emit('opponent_left');
        broadcastRoom(room);
      }
    }
    socket.data.room = null;
    socket.data.player = null;
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room.players[1] === socket.id) room.players[1] = null;
    if (room.players[2] === socket.id) room.players[2] = null;
    if (!room.players[1] && !room.players[2]) rooms.delete(code);
    else {
      room.over = true;
      io.to(code).emit('opponent_left');
    }
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
