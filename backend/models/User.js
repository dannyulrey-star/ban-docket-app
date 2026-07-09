// This file defines the SHAPE of a "user" - just a display name, nothing else.
// There's no password or login here - a "user" is just a claimed name so the
// app can remember who's filing each ban.
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    unique: true, // MongoDB will reject a second user with the exact same name
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
