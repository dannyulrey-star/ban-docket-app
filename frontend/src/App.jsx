// ============================================================
// THE BAN LIST - FRONTEND (React)
// ============================================================
// This is the piece your friends will actually see and click on.
// It has no database of its own - every time it needs data, it
// asks the BACKEND (server.js) for it over the internet, using "fetch".

import { useState, useEffect } from 'react';
import { CHAMPIONS } from './champions';

// This is the address of your backend API.
// While developing on your own computer, it points at localhost.
// Once deployed, you'll set VITE_API_URL to your real Render URL
// (explained in the README) and this line picks that up automatically.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// The shared "group secret" - anyone filing or lifting a ban must send this
// back to the backend, which checks it against its own GROUP_SECRET value.
const GROUP_SECRET = import.meta.env.VITE_GROUP_SECRET || '';

// The key we use to remember "who you are" in this browser. There's no
// password behind this - it's just a claimed name, saved locally so you
// don't have to re-enter it every visit.
const CURRENT_USER_KEY = 'banListCurrentUser';

// How many different players have to click "Lift This Ban" before it's
// actually removed - matches VOTES_REQUIRED_TO_LIFT on the backend.
const VOTES_REQUIRED_TO_LIFT = 3;

function App() {
  // ---- STATE ----
  // "State" is just data that React watches. When state changes,
  // React automatically re-draws (re-renders) the parts of the page that use it.

  const [bans, setBans] = useState([]);       // the list of bans we got from the backend
  const [loading, setLoading] = useState(true); // true while we're waiting on the first fetch
  const [error, setError] = useState('');       // holds an error message, if something goes wrong

  // form field values - one piece of state per input box
  const [champion, setChampion] = useState('');
  const [bannedFrom, setBannedFrom] = useState('');
  const [bannedBy, setBannedBy] = useState('');
  const [reason, setReason] = useState('');

  // ---- "WHO AM I" IDENTITY STATE ----
  const [users, setUsers] = useState([]);           // every name that's ever been claimed
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
    } catch {
      return null;
    }
  });
  const [nameInput, setNameInput] = useState('');     // the "enter your name" box
  const [identityError, setIdentityError] = useState('');
  const [identityBusy, setIdentityBusy] = useState(false);

  // ---- LOAD BANS AND USERS WHEN THE PAGE FIRST OPENS ----
  // useEffect runs some code automatically. The empty array `[]` at the
  // end means "only run this once, right when the component first appears."
  useEffect(() => {
    fetchBans();
    fetchUsers();
  }, []);

  // Whenever the logged-in user changes, auto-fill "Filed By" with their name.
  useEffect(() => {
    setBannedBy(currentUser ? currentUser.name : '');
  }, [currentUser]);

  async function fetchUsers() {
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) throw new Error('Server responded with an error');
      setUsers(await response.json());
    } catch (err) {
      // Not fatal - worst case, a duplicate name gets caught by the backend instead.
    }
  }

  function loginAs(user) {
    setCurrentUser(user);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    setNameInput('');
    setIdentityError('');
  }

  function logout() {
    setCurrentUser(null);
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  // Runs when the "Continue" button in the sidebar is submitted.
  async function handleIdentitySubmit(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    // If this name was already claimed, just log back in as it - no need
    // to create anything new.
    const existing = users.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      loginAs(existing);
      return;
    }

    setIdentityBusy(true);
    setIdentityError('');
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-group-secret': GROUP_SECRET,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      if (response.status === 409) {
        setIdentityError('That name was just taken. Try another.');
        fetchUsers();
        return;
      }
      if (!response.ok) throw new Error('Failed to create user');

      const newUser = await response.json();
      setUsers((prev) => [...prev, newUser]);
      loginAs(newUser);
    } catch (err) {
      setIdentityError('Could not set up that name. Try again.');
    } finally {
      setIdentityBusy(false);
    }
  }

  // "async function" means this function will do something that takes time
  // (like a network request) and we use "await" to pause until it finishes,
  // without freezing the rest of the page.
  async function fetchBans() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/bans`);
      if (!response.ok) throw new Error('Server responded with an error');
      const data = await response.json();
      setBans(data);
      setError('');
    } catch (err) {
      setError('Could not reach the ban list server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  // Runs when the "File Ban" form is submitted.
  async function handleSubmit(e) {
    e.preventDefault(); // stops the browser from doing a full page reload on submit

    if (!champion.trim() || !bannedFrom.trim() || !bannedBy.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/bans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-group-secret': GROUP_SECRET,
        },
        body: JSON.stringify({ champion, bannedFrom, bannedBy, reason }),
      });
      if (!response.ok) throw new Error('Failed to file ban');

      // Clear the form fields after a successful submit - "Filed By" stays as-is,
      // since it's tied to whoever's logged in, not something you retype each time.
      setChampion('');
      setBannedFrom('');
      setReason('');

      // Re-fetch the list so the new ban shows up immediately
      fetchBans();
    } catch (err) {
      setError('Could not file the ban. Try again.');
    }
  }

  // Runs when someone clicks "Lift This Ban" on a specific case. This doesn't
  // remove the ban outright - it casts one vote, and only once enough unique
  // players have voted does the backend actually delete it.
  async function voteLift(id) {
    if (!currentUser) return;

    try {
      const response = await fetch(`${API_URL}/api/bans/${id}/votes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-group-secret': GROUP_SECRET,
        },
        body: JSON.stringify({ voter: currentUser.name }),
      });

      if (response.status === 409) {
        setError("You've already voted to lift this ban.");
        return;
      }
      if (!response.ok) throw new Error('Failed to record vote');

      if (response.status === 204) {
        // Enough votes were cast - the ban is gone for real.
        setBans((prev) => prev.filter((ban) => ban._id !== id));
      } else {
        const updated = await response.json();
        setBans((prev) => prev.map((ban) => (ban._id === id ? updated : ban)));
      }
    } catch (err) {
      setError('Could not record your vote. Try again.');
    }
  }

  // Runs when someone clicks "Approve This Ban". A single approval (from anyone
  // except the player who filed it) locks the ban in permanently.
  async function approveBan(id) {
    if (!currentUser) return;

    try {
      const response = await fetch(`${API_URL}/api/bans/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-group-secret': GROUP_SECRET,
        },
        body: JSON.stringify({ approver: currentUser.name }),
      });

      if (response.status === 403) {
        setError('You cannot approve a ban you filed yourself.');
        return;
      }
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || 'This ban can no longer be approved.');
        return;
      }
      if (!response.ok) throw new Error('Failed to record approval');

      const updated = await response.json();
      setBans((prev) => prev.map((ban) => (ban._id === id ? updated : ban)));
    } catch (err) {
      setError('Could not record the approval. Try again.');
    }
  }

  function formatDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Turns an approval deadline into a short human countdown, e.g. "3d 4h left".
  function timeRemaining(deadline) {
    const diffMs = new Date(deadline).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';

    const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return 'Less than 1h left';
  }

  // ---- WHAT ACTUALLY GETS DRAWN ON SCREEN ----
  // This is JSX - it looks like HTML but it's really JavaScript.
  // Anything inside { curly braces } is regular JS being inserted into the page.
  return (
    <div className="page">
      <aside className="sidebar">
        <div className="identity-panel">
          <div className="identity-title">Banner Log In</div>
          {currentUser ? (
            <>
              <div className="identity-current">
                Logged in as
                <br />
                <b>{currentUser.name}</b>
              </div>
              <button type="button" className="switch-btn" onClick={logout}>
                Not you? Switch
              </button>
            </>
          ) : (
            <form onSubmit={handleIdentitySubmit} className="identity-form">
              <label htmlFor="playerName">Enter your name</label>
              <input
                id="playerName"
                placeholder="e.g. Jake"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={50}
                required
              />
              <button type="submit" className="identity-btn" disabled={identityBusy}>
                {identityBusy ? 'Please wait…' : 'Continue'}
              </button>
              {identityError && <div className="identity-error">{identityError}</div>}
              <p className="identity-hint">
                First time? This claims your name. Used it before? Type it again to log back in.
              </p>
            </form>
          )}
        </div>
      </aside>

      <div className="wrap">
        <header>
          <div className="eyebrow">Est. this friend group · No appeals</div>
          <h1>THE BAN LIST</h1>
          <p className="subtitle">Whoever files it, the group must honor it.</p>
        </header>

        <div className="docket-count">
          {loading
            ? 'Loading the docket…'
            : bans.length === 0
            ? 'The docket is currently empty'
            : `${bans.length} active ban${bans.length === 1 ? '' : 's'} on the docket`}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {currentUser ? (
          <form onSubmit={handleSubmit}>
            <div className="form-title">File a New Ban</div>
            <div className="row">
              <div>
                <label htmlFor="champion">Champion</label>
                <input
                  id="champion"
                  list="champion-options"
                  placeholder="Start typing a champion..."
                  autoComplete="off"
                  value={champion}
                  onChange={(e) => setChampion(e.target.value)}
                  required
                />
                <datalist id="champion-options">
                  {CHAMPIONS.map((name) => (
                    <option value={name} key={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="bannedFrom">Banned From (player)</label>
                <input
                  id="bannedFrom"
                  placeholder="e.g. Jake"
                  value={bannedFrom}
                  onChange={(e) => setBannedFrom(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="bannedBy">Filed By (player)</label>
                <input id="bannedBy" value={bannedBy} readOnly />
              </div>
              <div>
                <label htmlFor="reason">Reason (optional)</label>
                <input
                  id="reason"
                  placeholder="e.g. inted 0/12 again"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <div className="submit-row">
              <button type="submit" className="file-btn">File Ban</button>
            </div>
          </form>
        ) : (
          <div className="login-required">
            Enter your name on the left before you can file a ban.
          </div>
        )}

        <div className="entries">
          {!loading && bans.length === 0 && (
            <div className="empty">The docket is empty. Nobody has been banned—yet.</div>
          )}

          {bans.map((ban, index) => {
            const votes = ban.liftVotes || [];
            const hasVoted = currentUser
              ? votes.some((v) => v.toLowerCase() === currentUser.name.toLowerCase())
              : false;
            const isOwnBan = currentUser
              ? currentUser.name.toLowerCase() === ban.bannedBy.toLowerCase()
              : false;

            return (
              <div className="case" key={ban._id}>
                <div className="stamp">Banned</div>
                {ban.status === 'pending' && (
                  <div className="stamp stamp-pending">Pending Approval</div>
                )}
                <div className="case-number">
                  Case No. {String(bans.length - index).padStart(3, '0')} · Filed {formatDate(ban.createdAt)}
                </div>
                <div className="case-champion">{ban.champion}</div>
                <div className="case-detail">
                  <b>{ban.bannedFrom}</b> is forbidden from playing this champion.
                  <br />
                  Filed by <b>{ban.bannedBy}</b>
                  {ban.reason && <> — "{ban.reason}"</>}
                </div>
                <div className="approval-row">
                  {ban.status === 'approved' && (
                    <span className="status-badge status-approved">
                      Approved by {ban.approvedBy}
                    </span>
                  )}
                  {ban.status === 'expired' && (
                    <span className="status-badge status-expired">
                      Expired — never approved
                    </span>
                  )}
                  {ban.status === 'pending' && (
                    <>
                      <button
                        className="approve-btn"
                        onClick={() => approveBan(ban._id)}
                        disabled={!currentUser || isOwnBan}
                        title={
                          !currentUser
                            ? 'Log in to approve this ban'
                            : isOwnBan
                            ? "You can't approve a ban you filed"
                            : undefined
                        }
                      >
                        Approve This Ban
                      </button>
                      <span className="status-badge status-pending">
                        {timeRemaining(ban.approvalDeadline)}
                      </span>
                    </>
                  )}
                </div>
                <div className="lift-row">
                  <button
                    className="lift-btn"
                    onClick={() => voteLift(ban._id)}
                    disabled={!currentUser || hasVoted}
                    title={!currentUser ? 'Log in to vote to lift this ban' : undefined}
                  >
                    {hasVoted ? 'Vote Recorded' : 'Lift This Ban'}
                  </button>
                  <div className="vote-checks">
                    {Array.from({ length: VOTES_REQUIRED_TO_LIFT }).map((_, i) => (
                      <span
                        key={i}
                        className={`vote-check${i < votes.length ? ' filled' : ''}`}
                      >
                        ✓
                      </span>
                    ))}
                  </div>
                  <span className="vote-hint">
                    {votes.length}/{VOTES_REQUIRED_TO_LIFT} votes to lift
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
