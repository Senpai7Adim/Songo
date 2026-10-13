'use strict';

const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    playerId: { type: String, required: true, ref: 'Player', index: true },
    opponentId: { type: String, default: null },
    roomCode: { type: String, default: null },
    gameNo: { type: Number, default: null },
    mode: { type: String, required: true },
    result: { type: String, required: true },
    yourScore: { type: Number, default: 0 },
    oppScore: { type: Number, default: 0 },
    oppName: { type: String, default: 'Adversaire' },
    oppAvatar: { type: String, default: '👤' },
    rated: { type: Boolean, default: false },
    eloDelta: { type: Number, default: 0 },
    eloBefore: { type: Number, default: 1200 },
    eloAfter: { type: Number, default: 1200 },
    aiDiff: { type: Number, default: null },
    timeControl: { type: String, default: '∞' },
    reason: { type: String, default: 'normal' },
    ts: { type: Number, required: true, index: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

matchSchema.index({ playerId: 1, ts: -1 });
matchSchema.index(
  { playerId: 1, roomCode: 1, gameNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      roomCode: { $type: 'string' },
      gameNo: { $type: 'number' }
    }
  }
);

module.exports = mongoose.model('Match', matchSchema);
