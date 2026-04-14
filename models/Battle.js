const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
  battleId: { type: String, required: true, unique: true },
  challenger: { type: String, required: true },
  opponent: { type: String, required: true },
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
  endDate: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Battle', battleSchema);
