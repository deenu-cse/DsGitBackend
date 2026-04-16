const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
  battleId: { type: String, required: true, unique: true },
  challenger: { type: String, required: false }, // Made optional for open battles
  opponent: { type: String, required: false },   // Made optional for open battles
  type: { type: String, required: true },
  duration: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending_invite', 'active', 'won', 'lost', 'draw'], 
    default: 'pending_invite' 
  },
  winner: { type: String, default: null },
  loser: { type: String, default: null },
  startDate: { type: Date },
  endDate: { type: Date },
  
  // New fields for public arena battles
  isPublic: { type: Boolean, default: false },
  maxPlayers: { type: Number, default: 2 },
  acceptingJoins: { type: Boolean, default: true },
  publicUrl: { type: String },
  
  participants: [{ 
    userId: String,
    username: String,
    avatarInitial: String,
    currentStreak: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    hardSolved: { type: Number, default: 0 },
    mediumSolved: { type: Number, default: 0 },
    easySolved: { type: Number, default: 0 },
    platforms: {
      leetcode: { type: Number, default: 0 },
      gfg: { type: Number, default: 0 },
      codingninjas: { type: Number, default: 0 }
    },
    isEliminated: { type: Boolean, default: false },
    eliminatedOnDay: { type: Number, default: null },
    joinedAt: { type: Date, default: Date.now }
  }],

  activityFeed: [{
    username: String,
    questionName: String,
    platform: String,
    difficulty: String,
    points: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Battle', battleSchema);
