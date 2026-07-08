// This file defines the SHAPE of a "ban" document that gets stored in MongoDB.
// Think of a "schema" like a form template: it says what fields exist,
// whether they're required, and what type of data they hold.
const mongoose = require('mongoose');

const banSchema = new mongoose.Schema({
  champion: {
    type: String,
    required: true, // you can't save a ban without a champion name
    trim: true,     // automatically removes extra whitespace like "  Yasuo  " -> "Yasuo"
  },
  bannedFrom: {
    type: String,   // the friend who is NOT allowed to play this champion
    required: true,
    trim: true,
  },
  bannedBy: {
    type: String,   // the friend who filed the ban
    required: true,
    trim: true,
  },
  reason: {
    type: String,   // optional - why the ban happened
    default: '',
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now, // automatically set to "right now" when a ban is created
  },
});

// This line turns the schema into a "Model" - an object we can actually use
// in our code to create, find, and delete bans in the database.
// Mongoose will automatically create a MongoDB "collection" called "bans".
module.exports = mongoose.model('Ban', banSchema);
