const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  githubId: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, default: null }, // Optional, linked via extension settings
  avatar_url: { type: String },
  signupDate: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
