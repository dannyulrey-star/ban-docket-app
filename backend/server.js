// ============================================================
// THE BAN LIST - BACKEND SERVER
// ============================================================
// This file starts a small web server. Its only job is to:
//   1. Talk to the database (MongoDB)
//   2. Answer requests from the frontend (React app) with data
// This is called an "API" (Application Programming Interface) -
// it's just a set of URLs that return JSON instead of a web page.

require('dotenv').config(); // loads secret values from a local .env file (like the database password)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Ban = require('./models/Ban'); // our data shape, defined in models/Ban.js

const app = express();

// ---- MIDDLEWARE ----
// "Middleware" runs on every request before it reaches your routes below.
app.use(cors());          // allows the frontend (a different URL) to call this backend
app.use(express.json());  // lets us read JSON sent from the frontend (req.body)

// ---- CONNECT TO THE DATABASE ----
// process.env.MONGODB_URI comes from your .env file (see .env.example).
// This is the "address + password" for your MongoDB Atlas database.
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

// ---- ROUTES ----
// A "route" is: when someone visits this URL with this HTTP method, run this function.
// The 4 common HTTP methods map to CRUD actions:
//   GET    = Read (get data)
//   POST   = Create (add new data)
//   PUT    = Update (change existing data) - not needed for this app
//   DELETE = Delete (remove data)

// Simple health check - visiting this in a browser confirms the server is alive.
app.get('/', (req, res) => {
  res.json({ message: 'The Ban List API is running.' });
});

// GET /api/bans - return every ban currently on the docket, newest first.
app.get('/api/bans', async (req, res) => {
  try {
    const bans = await Ban.find().sort({ createdAt: -1 });
    res.json(bans);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch bans.' });
  }
});

// POST /api/bans - create a new ban.
// The frontend sends data in req.body, e.g. { champion: "Yasuo", bannedFrom: "Jake", ... }
app.post('/api/bans', async (req, res) => {
  try {
    const { champion, bannedFrom, bannedBy, reason } = req.body;

    // Basic validation - reject incomplete requests before they hit the database.
    if (!champion || !bannedFrom || !bannedBy) {
      return res.status(400).json({
        error: 'champion, bannedFrom, and bannedBy are all required.',
      });
    }

    const newBan = await Ban.create({ champion, bannedFrom, bannedBy, reason });
    res.status(201).json(newBan); // 201 = "Created successfully"
  } catch (err) {
    res.status(500).json({ error: 'Could not create ban.' });
  }
});

// DELETE /api/bans/:id - remove one ban by its database ID.
// ":id" is a "route parameter" - whatever the caller puts there is available as req.params.id
app.delete('/api/bans/:id', async (req, res) => {
  try {
    const deleted = await Ban.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Ban not found.' });
    }
    res.status(204).send(); // 204 = "Success, nothing to send back"
  } catch (err) {
    res.status(500).json({ error: 'Could not delete ban.' });
  }
});

// ---- START THE SERVER ----
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
