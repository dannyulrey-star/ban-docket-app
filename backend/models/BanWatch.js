// This file defines the SHAPE of a "ban watch" - a heads-up that a player
// is being watched for a possible future ban on a given champion. It's not
// an actual ban - just a 7-day flag anyone can raise for the group to see.
const mongoose = require('mongoose');

const banWatchSchema = new mongoose.Schema({
  champion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  bannedFrom: {
    type: String,   // the summoner being watched
    required: true,
    trim: true,
    maxlength: 50,
  },
  createdBy: {
    type: String,   // the summoner who raised the watch
    required: true,
    trim: true,
    maxlength: 50,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,     // seven days from creation - the watch drops off after this
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
});

module.exports = mongoose.model('BanWatch', banWatchSchema);
