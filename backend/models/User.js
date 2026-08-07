// This file defines the SHAPE of a "user" - a display name, plus (once someone
// has actually logged in with Discord) the Discord account it's linked to.
// A user can exist two ways:
//   1. Someone logs in with Discord - we get a real, verified identity.
//   2. Someone adds a name to the "Banned From" list by hand - that's just a
//      target name for a ban, not a login, so it has no discordId.
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    unique: true, // MongoDB will reject a second user with the exact same name
  },
  // Discord's permanent numeric ID for this account. Only set once someone
  // has actually signed in with Discord - "sparse" means MongoDB only
  // enforces uniqueness among documents that HAVE a discordId, so the many
  // hand-added names with no discordId don't collide with each other.
  discordId: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
  },
  // Discord's avatar hash for this account, used to build their avatar URL.
  // Null if they've never logged in with Discord, or have no custom avatar.
  avatar: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
