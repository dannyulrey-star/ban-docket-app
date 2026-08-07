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
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Ban = require('./models/Ban'); // our data shape, defined in models/Ban.js
const User = require('./models/User'); // a claimed player name, defined in models/User.js
const BanWatch = require('./models/BanWatch'); // a 7-day "keep an eye on this" flag, defined in models/BanWatch.js

const app = express();

// Render (and most hosts) put the app behind a reverse proxy, so the real
// visitor IP arrives in the X-Forwarded-For header instead of the raw
// socket address. This tells Express to trust that header - without it,
// express-rate-limit can't tell visitors apart and logs a warning on
// every request.
app.set('trust proxy', 1);

// ---- MIDDLEWARE ----
// "Middleware" runs on every request before it reaches your routes below.
// Only let our own deployed frontend call this API - not any random website.
// process.env.FRONTEND_ORIGIN comes from your .env file, e.g. https://ban-list.vercel.app
// "credentials: true" lets the browser send/receive our login cookie across
// the frontend/backend split - without it, the session cookie set below
// would just get silently dropped by the browser.
app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());  // lets us read JSON sent from the frontend (req.body)
app.use(cookieParser());  // lets us read the login cookie sent back on every request

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
app.use('/api/ban-watches', apiRateLimit);
app.use('/api/auth', apiRateLimit);

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

// ---- LOGIN (DISCORD OAUTH) ----
// Real Riot Games login (called "RSO") isn't something a small app like this
// can get access to - Riot only hands it out to products it has manually
// reviewed and approved. Discord OAuth does the same job (proving "this
// really is that person," not just "they typed a name") and anyone can set
// it up in a few minutes at discord.com/developers - see README for setup.
const SESSION_COOKIE = 'banlist_session';
const inProduction = process.env.NODE_ENV === 'production';

// Turns a logged-in user into a signed token we can hand back as a cookie.
// The browser can read/carry this cookie but can't forge or edit it without
// knowing SESSION_SECRET, which only this server has.
function signSession(user) {
  return jwt.sign(
    { sub: user._id.toString(), name: user.name },
    process.env.SESSION_SECRET,
    { expiresIn: '30d' }
  );
}

// requireAuth - blocks write requests unless the caller has a valid login
// cookie from signing in with Discord. On success, req.user is set to
// { id, name } so routes can trust WHO is making the request instead of
// just trusting whatever name the client claims to be.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: 'Not logged in.' });

    const payload = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = { id: payload.sub, name: payload.name };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Your login has expired. Please log in again.' });
  }
}

// GET /api/auth/discord - step 1 of login: send the browser to Discord to
// approve access, with a random "state" value it'll hand back in step 2 so
// we can tell this callback really followed our own redirect (CSRF check).
app.get('/api/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: inProduction,
    sameSite: inProduction ? 'none' : 'lax',
    maxAge: 5 * 60 * 1000, // only needs to survive the round trip to Discord and back
  });

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// GET /api/auth/discord/callback - step 2: Discord sends the browser back
// here with a one-time code (proof the user approved access) and the state
// value from step 1. We trade the code for an access token, use that to ask
// Discord who this is, then find-or-create our own User record for them.
app.get('/api/auth/discord/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = req.cookies.oauth_state;
    res.clearCookie('oauth_state');

    if (!code || !state || state !== expectedState) {
      return res.status(400).send('Login failed: invalid or expired login attempt. Please try again.');
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenResponse.ok) throw new Error('Discord rejected the login code.');
    const { access_token } = await tokenResponse.json();

    const profileResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileResponse.ok) throw new Error('Could not fetch the Discord profile.');
    const profile = await profileResponse.json();
    const displayName = (profile.global_name || profile.username || '').trim();

    // Already logged in before? Reuse that same User record.
    let user = await User.findOne({ discordId: profile.id });

    if (!user) {
      // First time this Discord account has logged in. If a name matching
      // their Discord display name was already hand-added to the "Banned
      // From" list (and isn't claimed by someone else's Discord login yet),
      // link this login to that existing name instead of making a duplicate.
      user = await User.findOne({
        name: new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        discordId: null,
      });

      if (user) {
        user.discordId = profile.id;
        user.avatar = profile.avatar;
        await user.save();
      } else {
        // Name collision with someone else's account - fall back to a name
        // that's guaranteed unique rather than fail the login outright.
        let name = displayName || `Summoner${profile.id.slice(-4)}`;
        if (await User.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) {
          name = `${name}-${profile.id.slice(-4)}`;
        }
        user = await User.create({ name, discordId: profile.id, avatar: profile.avatar });
      }
    } else if (user.avatar !== profile.avatar) {
      user.avatar = profile.avatar; // keep their avatar fresh across logins
      await user.save();
    }

    const token = signSession(user);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: inProduction,
      sameSite: inProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.redirect(process.env.FRONTEND_ORIGIN);
  } catch (err) {
    console.error('Discord login error:', err.message);
    res.status(500).send('Login failed. Please close this tab and try again.');
  }
});

// GET /api/auth/me - lets the frontend ask "who's currently logged in?"
// (or find out no one is, via the 401 from requireAuth) each time it loads.
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Not logged in.' });

  res.json({
    id: user._id,
    name: user.name,
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
      : null,
  });
});

// POST /api/auth/logout - just deletes the login cookie. There's nothing to
// invalidate server-side since the token itself expires on its own.
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).send();
});

// Escapes regex special characters so a name like "J.T." can't be
// interpreted as a pattern when we search for it below.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/users - return every name on the "Banned From" roster, so the
// frontend can build its dropdown and tell whether a name already exists.
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users.' });
  }
});

// POST /api/users - add a name to the "Banned From" list by hand (for
// friends who get banned but don't log in themselves). Requires being
// logged in via Discord, but doesn't claim the name as YOUR identity - your
// identity is always whichever Discord account you logged in with.
app.post('/api/users', requireAuth, async (req, res) => {
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
// "bannedBy" is NOT read from the request - it's always whoever is logged
// in, so nobody can file a ban under someone else's name.
app.post('/api/bans', requireAuth, async (req, res) => {
  try {
    const { champion, bannedFrom, reason } = req.body;
    const bannedBy = req.user.name;

    // Basic validation - reject incomplete requests before they hit the database.
    if (!champion || !bannedFrom) {
      return res.status(400).json({
        error: 'champion and bannedFrom are required.',
      });
    }

    const newBan = await Ban.create({ champion, bannedFrom, bannedBy, reason });
    res.status(201).json(newBan); // 201 = "Created successfully"
  } catch (err) {
    res.status(500).json({ error: 'Could not create ban.' });
  }
});

// GET /api/ban-watches - return every ban watch still in effect (not yet
// expired), newest first. Expired ones just stop being returned here.
app.get('/api/ban-watches', async (req, res) => {
  try {
    const watches = await BanWatch.find({ expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    res.json(watches);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch ban watches.' });
  }
});

// POST /api/ban-watches - raise a new ban watch. Runs for 7 days from creation.
// "createdBy" comes from the login session, same reasoning as bannedBy above.
app.post('/api/ban-watches', requireAuth, async (req, res) => {
  try {
    const { champion, bannedFrom } = req.body;
    const createdBy = req.user.name;

    if (!champion || !bannedFrom) {
      return res.status(400).json({
        error: 'champion and bannedFrom are required.',
      });
    }

    const newWatch = await BanWatch.create({ champion, bannedFrom, createdBy });
    res.status(201).json(newWatch);
  } catch (err) {
    res.status(500).json({ error: 'Could not create ban watch.' });
  }
});

// How many unique players have to vote before a ban actually gets lifted.
const VOTES_REQUIRED_TO_LIFT = 3;

// POST /api/bans/:id/votes - cast one vote to lift a ban. Each player can
// only vote once per ban. Once enough unique players have voted, the ban
// is removed for real. The voter is always whoever is logged in.
app.post('/api/bans/:id/votes', requireAuth, async (req, res) => {
  try {
    const voter = req.user.name;

    const ban = await Ban.findById(req.params.id);
    if (!ban) {
      return res.status(404).json({ error: 'Ban not found.' });
    }

    const alreadyVoted = ban.liftVotes.some((v) => v.toLowerCase() === voter.toLowerCase());
    if (alreadyVoted) {
      return res.status(409).json({ error: 'You already voted to lift this ban.' });
    }

    ban.liftVotes.push(voter);

    if (ban.liftVotes.length >= VOTES_REQUIRED_TO_LIFT) {
      await ban.deleteOne();
      return res.status(204).send(); // enough votes - the ban is gone
    }

    await ban.save();
    res.json(ban); // not enough votes yet - send back the updated vote count
  } catch (err) {
    res.status(500).json({ error: 'Could not record vote.' });
  }
});

// POST /api/bans/:id/approve - a single other player approves this ban within
// its one-week window, making it stick around permanently (until lifted).
// The player who filed the ban can't approve their own. The approver is
// always whoever is logged in.
app.post('/api/bans/:id/approve', requireAuth, async (req, res) => {
  try {
    const approver = req.user.name;

    const ban = await Ban.findById(req.params.id);
    if (!ban) {
      return res.status(404).json({ error: 'Ban not found.' });
    }

    if (approver.toLowerCase() === ban.bannedBy.toLowerCase()) {
      return res.status(403).json({ error: 'You cannot approve a ban you filed yourself.' });
    }

    if (ban.status === 'approved') {
      return res.status(409).json({ error: 'This ban has already been approved.' });
    }

    if (ban.status === 'expired') {
      return res.status(409).json({ error: 'The approval window for this ban has expired.' });
    }

    ban.approvedBy = approver;
    ban.approvedAt = new Date();
    await ban.save();
    res.json(ban);
  } catch (err) {
    res.status(500).json({ error: 'Could not record approval.' });
  }
});

// DELETE /api/bans/:id - remove one ban by its database ID. Used to be
// gated behind a shared group password typed into a prompt each time; now
// that logging in actually proves who you are, being logged in is enough.
// ":id" is a "route parameter" - whatever the caller puts there is available as req.params.id
app.delete('/api/bans/:id', requireAuth, async (req, res) => {
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
