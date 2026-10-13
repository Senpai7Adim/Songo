'use strict';

const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    avatar: { type: String, default: '👤' },
    country: { type: String, default: 'CM' },
    elo: { type: Number, default: 1200, index: true },
    eloPeak: { type: Number, default: 1200 },
    setupDone: { type: Boolean, default: false },
    stats: {
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
      games: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      bestStreak: { type: Number, default: 0 },
      byAi: {
        1: { w: { type: Number, default: 0 }, l: { type: Number, default: 0 }, d: { type: Number, default: 0 } },
        2: { w: { type: Number, default: 0 }, l: { type: Number, default: 0 }, d: { type: Number, default: 0 } },
        3: { w: { type: Number, default: 0 }, l: { type: Number, default: 0 }, d: { type: Number, default: 0 } },
        4: { w: { type: Number, default: 0 }, l: { type: Number, default: 0 }, d: { type: Number, default: 0 } }
      },
      online: {
        w: { type: Number, default: 0 },
        l: { type: Number, default: 0 },
        d: { type: Number, default: 0 }
      },
      local: {
        games: { type: Number, default: 0 }
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

playerSchema.index({ elo: -1, 'stats.wins': -1, 'stats.games': 1 });

module.exports = mongoose.model('Player', playerSchema);
