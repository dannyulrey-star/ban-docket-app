// This file defines the SHAPE of a "ban" document that gets stored in MongoDB.
// Think of a "schema" like a form template: it says what fields exist,
// whether they're required, and what type of data they hold.
const mongoose = require('mongoose');

const banSchema = new mongoose.Schema({
  champion: {
    type: String,
    required: true, // you can't save a ban without a champion name
    trim: true,     // automatically removes extra whitespace like "  Yasuo  " -> "Yasuo"
    maxlength: 50,
  },
  bannedFrom: {
    type: String,   // the friend who is NOT allowed to play this champion
    required: true,
    trim: true,
    maxlength: 50,
  },
  bannedBy: {
    type: String,   // the friend who filed the ban
    required: true,
    trim: true,
    maxlength: 50,
  },
  reason: {
    type: String,   // optional - why the ban happened
    default: '',
    trim: true,
    maxlength: 200,
  },
  createdAt: {
    type: Date,
    default: Date.now, // automatically set to "right now" when a ban is created
  },
  liftVotes: {
    type: [String], // names of players who've voted to lift this ban - no repeats
    default: [],
  },
  approvalDeadline: {
    type: Date,     // one week from creation - the window to get this ban approved
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  approvedBy: {
    type: String,   // name of the player who approved this ban (not the filer)
    default: null,
    trim: true,
  },
  approvedAt: {
    type: Date,
    default: null,
  },
});

// A ban's "status" is derived from the fields above, not stored directly -
// that way there's only one place that decides what pending/approved/expired means.
banSchema.virtual('status').get(function () {
  if (this.approvedBy) return 'approved';
  if (this.approvalDeadline && this.approvalDeadline < new Date()) return 'expired';
  return 'pending';
});
banSchema.set('toJSON', { virtuals: true });

// This line turns the schema into a "Model" - an object we can actually use
// in our code to create, find, and delete bans in the database.
// Mongoose will automatically create a MongoDB "collection" called "bans".
module.exports = mongoose.model('Ban', banSchema);
