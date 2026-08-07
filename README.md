# The Ban List — Learn-by-Building Roadmap

A full-stack web app for you and your friends to log champion bans, built as a learning
project. This README is your step-by-step guide. Don't rush — do each phase in order,
and actually type the commands yourself rather than copy-pasting everything, since typing
is how the syntax starts to stick.

## The three pieces (read this first)

Every full-stack app is really three separate things talking to each other:

- **Frontend** (`/frontend`) — what your friends see in their browser. Built with React.
  It has zero memory of its own; every time it needs data, it asks the backend for it.
- **Backend** (`/backend`) — a small server built with Node.js + Express. Its only job
  is to receive requests (like "give me all the bans" or "add this new ban") and talk to
  the database.
- **Database** (MongoDB Atlas, cloud-hosted) — where the ban data actually lives
  permanently, so it survives even if the server restarts.

Request flow: **Browser → Frontend → Backend → Database → Backend → Frontend → Browser**

---

## Phase 0 — Install your tools

You'll need these installed on your computer once:

1. **Node.js** (includes npm) — download the LTS version from https://nodejs.org
   Verify it worked by opening a terminal and running:
   ```
   node --version
   npm --version
   ```
2. **Git** — https://git-scm.com/downloads (verify with `git --version`)
3. **A code editor** — [VS Code](https://code.visualstudio.com/) is the standard choice.
4. **A GitHub account** — sign up free at https://github.com. This is where your code
   will live and how Vercel/Render will deploy it automatically.

---

## Phase 1 — Run the backend locally

1. Open a terminal in the `backend` folder and install its dependencies (this reads
   `package.json` and downloads the listed libraries into a `node_modules` folder):
   ```
   cd backend
   npm install
   ```
2. Set up MongoDB Atlas (your free cloud database):
   - Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
   - Create a free **M0 cluster** (takes a couple minutes to provision).
   - Under **Database Access**, create a database user with a username and password.
   - Under **Network Access**, click "Allow access from anywhere" (0.0.0.0/0) — fine
     for a small friend project.
   - Click **Connect → Drivers**, and copy the connection string. It looks like:
     `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/...`
3. Create your real env file:
   ```
   cp .env.example .env
   ```
   Open `.env` and paste your MongoDB connection string in as `MONGODB_URI`, filling
   in your actual username and password.
4. Set up Discord login (this app uses "Log in with Discord" instead of a password —
   see "Why Discord and not Riot?" below for why):
   - Go to https://discord.com/developers/applications and click **New Application**.
     Name it whatever you want (e.g. "The Ban List").
   - Open the **OAuth2** tab. Copy the **Client ID** and (click "Reset Secret" if needed)
     the **Client Secret** into `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` in `.env`.
   - Still on the OAuth2 tab, under **Redirects**, click "Add Redirect" and enter
     exactly `http://localhost:3001/api/auth/discord/callback` — this must match
     `DISCORD_REDIRECT_URI` in `.env` character-for-character.
   - Fill in `SESSION_SECRET` in `.env` with any long random string (it signs the login
     cookie so no one else can forge one).
5. Start the server:
   ```
   npm run dev
   ```
   You should see `✅ Connected to MongoDB` and `🚀 Server running on http://localhost:3001`.
6. Test it in your browser by visiting `http://localhost:3001/api/bans` — you should see
   an empty array `[]` (since there are no bans yet).

**If it doesn't connect:** double check your password doesn't have special characters
that need URL-encoding, and that Network Access allows your IP.

---

## Phase 2 — Run the frontend locally

1. Open a **second terminal** (leave the backend running in the first one) in the
   `frontend` folder:
   ```
   cd frontend
   npm install
   cp .env.example .env
   npm run dev
   ```
2. Vite will print a local URL, usually `http://localhost:5173`. Open it in your browser.
3. You should see The Ban List. Try filing a ban — it should appear instantly, and if
   you refresh the page, it should still be there (because it's now saved in MongoDB,
   not just sitting in your browser's memory).

At this point, the whole app works locally. Everything after this is about putting it
on the internet so your friends (who don't have your code) can use it.

---

## Phase 3 — Push your code to GitHub

1. In the **root** `ban-docket-app` folder:
   ```
   git init
   git add .
   git commit -m "Initial commit: working Ban List app"
   ```
2. On GitHub.com, click **New repository**, name it `ban-docket-app`, leave it empty
   (no README/license), and create it.
3. Copy the commands GitHub shows you under "…or push an existing repository", something like:
   ```
   git remote add origin https://github.com/YOUR_USERNAME/ban-docket-app.git
   git branch -M main
   git push -u origin main
   ```

Your `.env` files will NOT be pushed (they're in `.gitignore`) — that's intentional,
since they contain secrets.

---

## Phase 4 — Deploy the backend (Render)

1. Go to https://render.com and sign up (you can sign up with GitHub directly).
2. Click **New → Web Service**, connect your `ban-docket-app` GitHub repo.
3. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment Variables**, add everything from your local backend `.env`
   *except* `PORT` (Render sets that itself): `MONGODB_URI`, `SESSION_SECRET`,
   `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. For `FRONTEND_ORIGIN` and
   `DISCORD_REDIRECT_URI`, use placeholder values for now — you'll fix these in
   step 6, once you know your real Vercel/Render URLs.
5. Click **Create Web Service**. Render will build and give you a live URL like
   `https://ban-docket-backend.onrender.com`.
6. Once you also have your Vercel URL from Phase 5 below, come back and:
   - Set the backend's `FRONTEND_ORIGIN` env var to your exact Vercel URL (no trailing slash).
   - Set `DISCORD_REDIRECT_URI` to `https://ban-docket-backend.onrender.com/api/auth/discord/callback`
     (using your real Render URL).
   - Add that same URL under **Redirects** in the Discord Developer Portal (OAuth2 tab) —
     Discord will reject the login otherwise, since it only allows redirecting to URLs
     you've explicitly listed there.
7. Visit `https://ban-docket-backend.onrender.com/api/bans` to confirm it responds
   (an empty array, or your existing bans).

Note: Render's free tier "sleeps" after 15 minutes of inactivity and takes ~30-60
seconds to wake back up on the next request. Totally fine for a friend-group joke app.

---

## Phase 5 — Deploy the frontend (Vercel)

1. Go to https://vercel.com and sign up with GitHub.
2. Click **Add New → Project**, import your `ban-docket-app` repo.
3. Set **Root Directory** to `frontend`. Vercel auto-detects Vite.
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = your Render backend URL (e.g. `https://ban-docket-backend.onrender.com`)
5. Click **Deploy**. Vercel gives you a live URL like `https://ban-docket-app.vercel.app`.
6. Go back to Phase 4, step 6, and finish wiring up `FRONTEND_ORIGIN`,
   `DISCORD_REDIRECT_URI`, and the Discord redirect list now that you have this URL.

Send that URL to your friends — that's it. They just click "Log in with Discord,"
nothing to install on their end.

### Why Discord and not Riot Games login?

Riot Games has its own OAuth ("RSO"), but it's not self-serve — Riot only grants
access to products it has manually reviewed and approved, which isn't realistic for
a small friend-group app. Discord OAuth gets the same result (proving someone really
is who they say they are, instead of just typing a name) and anyone can set it up
themselves in a few minutes.

---

## Phase 6 — Making changes later

Whenever you want to change anything (styling, new fields, etc.):
1. Edit the code locally, test it with `npm run dev` in both folders.
2. `git add . && git commit -m "describe your change" && git push`
3. Vercel and Render both auto-redeploy on every push to `main`. No manual redeploy step.

---

## Concepts glossary (since you're new to programming logic)

- **Variable** — a named box that holds a value, e.g. `const champion = "Yasuo"`.
- **Function** — a reusable block of instructions you can run by "calling" it, e.g. `fetchBans()`.
- **Async/await** — `fetch` requests over the internet take time. `await` tells JavaScript
  "pause this function here until the response comes back," without freezing the whole page.
- **JSON** — a text format for sending structured data (objects/arrays) between the
  frontend and backend. It looks just like a JavaScript object.
- **API endpoint** — a specific URL + HTTP method combo your backend listens for, e.g.
  `POST /api/bans` means "create a new ban."
- **State (React)** — data that, when changed, tells React to redraw the screen. Created
  with `useState`.
- **Environment variable** — a setting (like a database password or API URL) that lives
  outside your code, so the same code can behave differently in different places
  (your laptop vs. the live website) without editing the source.

## Suggested next features to build yourself (good practice exercises)

- Add a "date banned expires" field and auto-hide expired bans.
- Restrict login to only your friend group (e.g. check the logged-in Discord user is a
  member of your group's Discord server) instead of letting any Discord account log in.
