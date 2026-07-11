// One-off migration: mark every pre-existing ban as already-approved, so the
// new approval-window feature doesn't retroactively flag old bans as pending
// or expired. Run this once, manually, after deploying the schema change:
//   node scripts/backfill-approved-bans.js
require('dotenv').config();
const mongoose = require('mongoose');
const Ban = require('../models/Ban');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await Ban.updateMany(
    { approvedBy: null },
    [
      { $set: { approvedBy: 'Legacy', approvedAt: '$createdAt' } },
    ],
  );

  console.log(`Backfilled ${result.modifiedCount} existing ban(s) as approved.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
