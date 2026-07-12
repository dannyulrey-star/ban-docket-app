// ============================================================
// THE BAN LIST - FRONTEND (React)
// ============================================================
// This is the piece your friends will actually see and click on.
// It has no database of its own - every time it needs data, it
// asks the BACKEND (server.js) for it over the internet, using "fetch".

import { useState, useEffect } from 'react';
import { CHAMPIONS } from './champions';

// Sorted once, alphabetically, so the champion suggestion list is always in
// a predictable order regardless of how champions.js happens to list them.
const SORTED_CHAMPIONS = [...CHAMPIONS].sort((a, b) => a.localeCompare(b));

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

  // ---- CHAMPION AUTOCOMPLETE STATE ----
  const [championOpen, setChampionOpen] = useState(false);
  const [championHighlight, setChampionHighlight] = useState(-1);
  const [championError, setChampionError] = useState(false);

  const championMatches = champion.trim() === ''
    ? SORTED_CHAMPIONS
    : SORTED_CHAMPIONS.filter((name) => name.toLowerCase().includes(champion.trim().toLowerCase()));

  const validChampion = SORTED_CHAMPIONS.find(
    (name) => name.toLowerCase() === champion.trim().toLowerCase()
  );

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

  // ---- "REMOVE BAN" PASSWORD PROMPT STATE ----
  // Removing a ban outright (rather than voting to lift it) requires typing
  // the shared group password into a confirmation prompt each time - this
  // holds which ban that prompt is currently open for, if any.
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removePassword, setRemovePassword] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);

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

  // Picks a champion from the suggestion list - snaps to its canonical
  // casing, in case the user typed it in a different case.
  function selectChampion(name) {
    setChampion(name);
    setChampionOpen(false);
    setChampionHighlight(-1);
    setChampionError(false);
  }

  // Lets arrow keys move through the suggestion list and Enter pick the
  // highlighted one, without submitting the form early.
  function handleChampionKeyDown(e) {
    if (!championOpen || championMatches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setChampionHighlight((prev) => Math.min(prev + 1, championMatches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setChampionHighlight((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && championHighlight >= 0) {
      e.preventDefault();
      selectChampion(championMatches[championHighlight]);
    } else if (e.key === 'Escape') {
      setChampionOpen(false);
    }
  }

  // Runs when the "File Ban" form is submitted.
  async function handleSubmit(e) {
    e.preventDefault(); // stops the browser from doing a full page reload on submit

    if (!validChampion) {
      setChampionError(true);
      return;
    }
    if (!bannedFrom.trim() || !bannedBy.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/bans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-group-secret': GROUP_SECRET,
        },
        body: JSON.stringify({ champion: validChampion, bannedFrom, bannedBy, reason }),
      });
      if (!response.ok) throw new Error('Failed to file ban');

      // Clear the form fields after a successful submit - "Filed By" stays as-is,
      // since it's tied to whoever's logged in, not something you retype each time.
      setChampion('');
      setChampionError(false);
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

  // Opens the password prompt for a specific ban's "Remove Ban" button.
  function openRemovePrompt(ban) {
    setRemoveTarget(ban);
    setRemovePassword('');
    setRemoveError('');
  }

  function closeRemovePrompt() {
    setRemoveTarget(null);
    setRemovePassword('');
    setRemoveError('');
    setRemoveBusy(false);
  }

  // Runs when the password prompt is submitted. Sends whatever the user
  // typed as the group secret - the backend rejects it with 401 if it's wrong,
  // so there's no separate client-side password check to keep in sync.
  async function confirmRemoveBan(e) {
    e.preventDefault();
    if (!removeTarget) return;

    setRemoveBusy(true);
    setRemoveError('');
    try {
      const response = await fetch(`${API_URL}/api/bans/${removeTarget._id}`, {
        method: 'DELETE',
        headers: { 'x-group-secret': removePassword },
      });

      if (response.status === 401) {
        setRemoveError('Incorrect password.');
        return;
      }
      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to remove ban');
      }

      // 404 just means it's already gone (e.g. someone else removed it first) -
      // either way, drop it from the list on screen.
      setBans((prev) => prev.filter((b) => b._id !== removeTarget._id));
      closeRemovePrompt();
    } catch (err) {
      setRemoveError('Could not remove the ban. Try again.');
    } finally {
      setRemoveBusy(false);
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
          <div className="identity-title">Summoner Log In</div>
          {currentUser ? (
            <div className="identity-current">
              Logged in as
              <br />
              <b>{currentUser.name}</b>
            </div>
          ) : (
            <form onSubmit={handleIdentitySubmit} className="identity-form">
              <label htmlFor="playerName">Enter your summoner name</label>
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
                First time? This claims your summoner name. Used it before? Type it again to log back in.
              </p>
            </form>
          )}
        </div>
      </aside>

      <div className="wrap">
        <header>
          <div className="eyebrow">Summoner's Rift · No Appeals</div>
          <h1>THE BAN LIST</h1>
          <p className="subtitle">Whoever files it, the Rift must honor it.</p>
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
              <div className="champion-field">
                <label htmlFor="champion">Champion</label>
                <input
                  id="champion"
                  placeholder="Start typing a champion..."
                  autoComplete="off"
                  value={champion}
                  onChange={(e) => {
                    setChampion(e.target.value);
                    setChampionOpen(true);
                    setChampionHighlight(-1);
                    setChampionError(false);
                  }}
                  onFocus={() => setChampionOpen(true)}
                  onBlur={() => {
                    setChampionOpen(false);
                    setChampionError(champion.trim() !== '' && !validChampion);
                  }}
                  onKeyDown={handleChampionKeyDown}
                  required
                />
                {championOpen && championMatches.length > 0 && (
                  <ul className="champion-suggestions">
                    {championMatches.map((name, i) => (
                      <li
                        key={name}
                        className={`champion-suggestion${i === championHighlight ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectChampion(name);
                        }}
                        onMouseEnter={() => setChampionHighlight(i)}
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
                {championError && (
                  <div className="field-error">Pick a champion from the list.</div>
                )}
              </div>
              <div>
                <label htmlFor="bannedFrom">Banned From (Summoner)</label>
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
                <label htmlFor="bannedBy">Filed By (Summoner)</label>
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
              <button
                type="submit"
                className="file-btn"
                disabled={champion.trim() !== '' && !validChampion}
              >
                File Ban
              </button>
            </div>
          </form>
        ) : (
          <div className="login-required">
            Enter your summoner name on the left before you can file a ban.
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
                <div className="danger-row">
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => openRemovePrompt(ban)}
                  >
                    Remove Ban
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {removeTarget && (
        <div className="modal-overlay" onClick={closeRemovePrompt}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Remove Ban</div>
            <p className="modal-text">
              Enter the group password to permanently remove <b>{removeTarget.champion}</b>{' '}
              ({removeTarget.bannedFrom}) from the docket. This cannot be undone.
            </p>
            <form onSubmit={confirmRemoveBan}>
              <label htmlFor="removePassword">Group Password</label>
              <input
                id="removePassword"
                type="password"
                autoFocus
                value={removePassword}
                onChange={(e) => setRemovePassword(e.target.value)}
                required
              />
              {removeError && <div className="field-error">{removeError}</div>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel-btn" onClick={closeRemovePrompt}>
                  Cancel
                </button>
                <button type="submit" className="modal-confirm-btn" disabled={removeBusy}>
                  {removeBusy ? 'Removing…' : 'Remove Ban'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
