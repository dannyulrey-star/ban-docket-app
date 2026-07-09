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
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Ban = require('./models/Ban'); // our data shape, defined in models/Ban.js
const User = require('./models/User'); // a claimed player name, defined in models/User.js

const app = express();

// ---- MIDDLEWARE ----
// "Middleware" runs on every request before it reaches your routes below.
// Only let our own deployed frontend call this API - not any random website.
// process.env.FRONTEND_ORIGIN comes from your .env file, e.g. https://ban-list.vercel.app
app.use(cors({ origin: process.env.FRONTEND_ORIGIN }));
app.use(express.json());  // lets us read JSON sent from the frontend (req.body)

// Caps each visitor (by IP) to 30 requests per minute on the bans/users routes,
// so one buggy script or bad actor can't hammer the database.
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});
app.use('/api/bans', apiRateLimit);
app.use('/api/users', apiRateLimit);

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

// requireGroupSecret - blocks write requests unless the caller sends the
// same shared secret we have in our own .env (process.env.GROUP_SECRET).
// This isn't user accounts/login - it's just a "you know the group password" gate.
function requireGroupSecret(req, res, next) {
  if (req.header('x-group-secret') !== process.env.GROUP_SECRET) {
    return res.status(401).json({ error: 'Missing or incorrect group secret.' });
  }
  next();
}

// Escapes regex special characters so a name like "J.T." can't be
// interpreted as a pattern when we search for it below.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/users - return every claimed player name, so the frontend can
// tell whether a name already exists before creating or "logging in" as it.
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users.' });
  }
});

// POST /api/users - claim a new player name. There's no password - this is
// just a "pick your name" step, not real authentication.
app.post('/api/users', requireGroupSecret, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const existing = await User.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (existing) {
      return res.status(409).json({ error: 'That name is already taken.' });
    }

    const newUser = await User.create({ name });
    res.status(201).json(newUser);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That name is already taken.' });
    }
    res.status(500).json({ error: 'Could not create user.' });
  }
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
app.post('/api/bans', requireGroupSecret, async (req, res) => {
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
app.delete('/api/bans/:id', requireGroupSecret, async (req, res) => {
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
