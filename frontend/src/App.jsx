// ============================================================
// THE BAN LIST - FRONTEND (React)
// ============================================================
// This is the piece your friends will actually see and click on.
// It has no database of its own - every time it needs data, it
// asks the BACKEND (server.js) for it over the internet, using "fetch".

import { useState, useEffect } from 'react';
import { CHAMPIONS, championIconUrl } from './champions';

// Sorted once, alphabetically, so the champion suggestion list is always in
// a predictable order regardless of how champions.js happens to list them.
const SORTED_CHAMPIONS = [...CHAMPIONS].sort((a, b) => a.localeCompare(b));

// This is the address of your backend API.
// While developing on your own computer, it points at localhost.
// Once deployed, you'll set VITE_API_URL to your real Render URL
// (explained in the README) and this line picks that up automatically.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  // Identity now comes from actually logging in with Discord (see
  // fetchCurrentUser below) instead of just typing a name - currentUser is
  // null until the backend confirms there's a valid login cookie.
  const [users, setUsers] = useState([]);           // every name on the "Banned From" list
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // true once we know either way

  // ---- "BANNED FROM" NAME LIST STATE ----
  // Reuses the same roster of claimed player names as the login panel above,
  // so "who can this ban target" and "who can log in" are always the same list.
  // The field itself is a click-to-open dropdown (no free text) styled the
  // same as the Champion field, with a window that opens to add a brand-new
  // name when it's not on the list yet.
  const sortedUserNames = [...users].map((u) => u.name).sort((a, b) => a.localeCompare(b));

  const [bannedFromOpen, setBannedFromOpen] = useState(false);
  const [bannedFromHighlight, setBannedFromHighlight] = useState(-1);
  const [bannedFromError, setBannedFromError] = useState(false);

  // "addNameTarget" tracks which field opened this shared modal - "main" for
  // the File a New Ban form, "watch" for the Create Ban Watch form - so the
  // new name lands back in the right one once it's added.
  const [addNameOpen, setAddNameOpen] = useState(false);
  const [addNameTarget, setAddNameTarget] = useState('main');
  const [addNameInput, setAddNameInput] = useState('');
  const [addNameError, setAddNameError] = useState('');
  const [addNameBusy, setAddNameBusy] = useState(false);

  // ---- "BAN WATCH" STATE ----
  // A "ban watch" is a lightweight heads-up (not an actual ban) that a
  // player is being eyed for a champion - it just sits in the sidebar for
  // 7 days. The create form reuses the same validated Champion/Summoner
  // pickers as the main ban form, just with their own state.
  const [banWatches, setBanWatches] = useState([]);
  const [watchModalOpen, setWatchModalOpen] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchFormError, setWatchFormError] = useState('');

  const [watchChampion, setWatchChampion] = useState('');
  const [watchChampionOpen, setWatchChampionOpen] = useState(false);
  const [watchChampionHighlight, setWatchChampionHighlight] = useState(-1);
  const [watchChampionError, setWatchChampionError] = useState(false);

  const watchChampionMatches = watchChampion.trim() === ''
    ? SORTED_CHAMPIONS
    : SORTED_CHAMPIONS.filter((name) => name.toLowerCase().includes(watchChampion.trim().toLowerCase()));

  const validWatchChampion = SORTED_CHAMPIONS.find(
    (name) => name.toLowerCase() === watchChampion.trim().toLowerCase()
  );

  const [watchBannedFrom, setWatchBannedFrom] = useState('');
  const [watchBannedFromOpen, setWatchBannedFromOpen] = useState(false);
  const [watchBannedFromHighlight, setWatchBannedFromHighlight] = useState(-1);
  const [watchBannedFromError, setWatchBannedFromError] = useState(false);

  // ---- "REMOVE BAN" CONFIRMATION STATE ----
  // Removing a ban outright (rather than voting to lift it) asks for a plain
  // confirmation first - this holds which ban that confirmation is currently
  // open for, if any. It used to also require typing a shared group password,
  // but now that logging in proves who you are, that's no longer needed.
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeError, setRemoveError] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);

  // ---- LOAD BANS AND USERS WHEN THE PAGE FIRST OPENS ----
  // useEffect runs some code automatically. The empty array `[]` at the
  // end means "only run this once, right when the component first appears."
  useEffect(() => {
    fetchBans();
    fetchUsers();
    fetchBanWatches();
    fetchCurrentUser();
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

  async function fetchBanWatches() {
    try {
      const response = await fetch(`${API_URL}/api/ban-watches`);
      if (!response.ok) throw new Error('Server responded with an error');
      setBanWatches(await response.json());
    } catch (err) {
      // Not fatal - the sidebar list just won't show until the next successful fetch.
    }
  }

  // Asks the backend "is there a valid login cookie on this browser?" - runs
  // once when the page loads, and again right after Discord sends someone
  // back here post-login (see the "Log in with Discord" link below).
  async function fetchCurrentUser() {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
      setCurrentUser(response.ok ? await response.json() : null);
    } catch (err) {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      // Not fatal - the cookie will just expire on its own eventually.
    } finally {
      setCurrentUser(null);
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

  // Picks a name from the "Banned From" dropdown.
  function selectBannedFromName(name) {
    setBannedFrom(name);
    setBannedFromOpen(false);
    setBannedFromHighlight(-1);
    setBannedFromError(false);
  }

  // Lets arrow keys move through the "Banned From" list (plus the trailing
  // "add new name" row) and Enter pick the highlighted one. There's no
  // typing to filter here - it's click/keyboard select only.
  function handleBannedFromKeyDown(e) {
    const totalRows = sortedUserNames.length + 1; // +1 for "+ Add new name..."

    if (!bannedFromOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setBannedFromOpen(true);
        setBannedFromHighlight(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setBannedFromHighlight((prev) => Math.min(prev + 1, totalRows - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setBannedFromHighlight((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && bannedFromHighlight >= 0) {
      e.preventDefault();
      if (bannedFromHighlight < sortedUserNames.length) {
        selectBannedFromName(sortedUserNames[bannedFromHighlight]);
      } else {
        setBannedFromOpen(false);
        openAddNameModal('main');
      }
    } else if (e.key === 'Escape') {
      setBannedFromOpen(false);
    }
  }

  // Opens the small window for typing a brand-new summoner name - triggered
  // by picking "+ Add new name..." in either the main form's or the ban
  // watch form's dropdown. "target" says which one gets the finished name.
  function openAddNameModal(target) {
    setAddNameTarget(target);
    setAddNameOpen(true);
    setAddNameInput('');
    setAddNameError('');
  }

  function closeAddNameModal() {
    setAddNameOpen(false);
    setAddNameInput('');
    setAddNameError('');
    setAddNameBusy(false);
  }

  // Adds a brand-new name to the shared "Banned From" roster, then selects
  // it as the value. This doesn't create a login - it's just a target name
  // for friends who get banned but don't log in with Discord themselves.
  async function submitAddName(e) {
    e.preventDefault();
    const trimmed = addNameInput.trim();
    if (!trimmed) return;

    setAddNameBusy(true);
    setAddNameError('');
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (response.status === 409) {
        setAddNameError('That name is already on the list.');
        return;
      }
      if (!response.ok) throw new Error('Failed to add name');

      const newUser = await response.json();
      setUsers((prev) => [...prev, newUser]);
      if (addNameTarget === 'watch') {
        setWatchBannedFrom(newUser.name);
        setWatchBannedFromError(false);
      } else {
        setBannedFrom(newUser.name);
      }
      closeAddNameModal();
    } catch (err) {
      setAddNameError('Could not add that name. Try again.');
    } finally {
      setAddNameBusy(false);
    }
  }

  // Opens the "Create Ban Watch" window with a blank form.
  function openWatchModal() {
    setWatchModalOpen(true);
    setWatchChampion('');
    setWatchChampionOpen(false);
    setWatchChampionError(false);
    setWatchBannedFrom('');
    setWatchBannedFromOpen(false);
    setWatchBannedFromError(false);
    setWatchFormError('');
  }

  function closeWatchModal() {
    setWatchModalOpen(false);
    setWatchChampionOpen(false);
    setWatchBannedFromOpen(false);
    setWatchBusy(false);
  }

  // Picks a champion for the ban watch form - same idea as selectChampion,
  // just against its own state.
  function selectWatchChampion(name) {
    setWatchChampion(name);
    setWatchChampionOpen(false);
    setWatchChampionHighlight(-1);
    setWatchChampionError(false);
  }

  function handleWatchChampionKeyDown(e) {
    if (!watchChampionOpen || watchChampionMatches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setWatchChampionHighlight((prev) => Math.min(prev + 1, watchChampionMatches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setWatchChampionHighlight((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && watchChampionHighlight >= 0) {
      e.preventDefault();
      selectWatchChampion(watchChampionMatches[watchChampionHighlight]);
    } else if (e.key === 'Escape') {
      setWatchChampionOpen(false);
    }
  }

  // Picks a summoner for the ban watch form - same idea as selectBannedFromName.
  function selectWatchBannedFromName(name) {
    setWatchBannedFrom(name);
    setWatchBannedFromOpen(false);
    setWatchBannedFromHighlight(-1);
    setWatchBannedFromError(false);
  }

  function handleWatchBannedFromKeyDown(e) {
    const totalRows = sortedUserNames.length + 1; // +1 for "+ Add new name..."

    if (!watchBannedFromOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setWatchBannedFromOpen(true);
        setWatchBannedFromHighlight(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setWatchBannedFromHighlight((prev) => Math.min(prev + 1, totalRows - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setWatchBannedFromHighlight((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && watchBannedFromHighlight >= 0) {
      e.preventDefault();
      if (watchBannedFromHighlight < sortedUserNames.length) {
        selectWatchBannedFromName(sortedUserNames[watchBannedFromHighlight]);
      } else {
        setWatchBannedFromOpen(false);
        openAddNameModal('watch');
      }
    } else if (e.key === 'Escape') {
      setWatchBannedFromOpen(false);
    }
  }

  // Runs when the "Create Ban Watch" form is submitted.
  async function submitBanWatch(e) {
    e.preventDefault();

    if (!validWatchChampion) {
      setWatchChampionError(true);
      return;
    }
    if (!watchBannedFrom) {
      setWatchBannedFromError(true);
      return;
    }

    setWatchBusy(true);
    setWatchFormError('');
    try {
      const response = await fetch(`${API_URL}/api/ban-watches`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          champion: validWatchChampion,
          bannedFrom: watchBannedFrom,
        }),
      });
      if (!response.ok) throw new Error('Failed to create ban watch');

      const newWatch = await response.json();
      setBanWatches((prev) => [newWatch, ...prev]);
      closeWatchModal();
    } catch (err) {
      setWatchFormError('Could not create the ban watch. Try again.');
    } finally {
      setWatchBusy(false);
    }
  }

  // Runs when the "File Ban" form is submitted.
  async function handleSubmit(e) {
    e.preventDefault(); // stops the browser from doing a full page reload on submit

    if (!validChampion) {
      setChampionError(true);
      return;
    }
    if (!bannedFrom) {
      setBannedFromError(true);
      return;
    }
    if (!currentUser) return;

    try {
      const response = await fetch(`${API_URL}/api/bans`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ champion: validChampion, bannedFrom, reason }),
      });
      if (!response.ok) throw new Error('Failed to file ban');

      // Clear the form fields after a successful submit - "Filed By" stays as-is,
      // since it's tied to whoever's logged in, not something you retype each time.
      setChampion('');
      setChampionError(false);
      setBannedFrom('');
      setBannedFromError(false);
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
        credentials: 'include',
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
        credentials: 'include',
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

  // Opens the confirmation prompt for a specific ban's "Remove Ban" button.
  function openRemovePrompt(ban) {
    setRemoveTarget(ban);
    setRemoveError('');
  }

  function closeRemovePrompt() {
    setRemoveTarget(null);
    setRemoveError('');
    setRemoveBusy(false);
  }

  // Runs when "Remove Ban" is confirmed in the modal. Identity comes from
  // the login cookie server-side, so there's nothing else to send here.
  async function confirmRemoveBan(e) {
    e.preventDefault();
    if (!removeTarget) return;

    setRemoveBusy(true);
    setRemoveError('');
    try {
      const response = await fetch(`${API_URL}/api/bans/${removeTarget._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.status === 401) {
        setRemoveError('Your login has expired. Please log in again.');
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
          <div className="identity-title">Log In</div>
          {currentUser ? (
            <div className="identity-current">
              {currentUser.avatarUrl && (
                <img className="identity-avatar" src={currentUser.avatarUrl} alt="" width={40} height={40} />
              )}
              <div>
                Logged in as
                <br />
                <b>{currentUser.name}</b>
              </div>
              <button type="button" className="identity-logout-btn" onClick={handleLogout}>
                Log Out
              </button>
            </div>
          ) : authChecked ? (
            <>
              <a className="identity-btn discord-btn" href={`${API_URL}/api/auth/discord`}>
                Log in with Discord
              </a>
              <p className="identity-hint">
                Real Riot Games login isn't available to small apps like this one, so we use your
                Discord account to prove who you are instead.
              </p>
            </>
          ) : (
            <p className="identity-hint">Checking login…</p>
          )}
        </div>

        <div className="watch-panel">
          <div className="identity-title">Ban Watch</div>
          <button
            type="button"
            className="identity-btn"
            onClick={openWatchModal}
            disabled={!currentUser}
            title={!currentUser ? 'Log in to create a ban watch' : undefined}
          >
            + Create Ban Watch
          </button>
          <div className="watch-list">
            {banWatches.length === 0 ? (
              <div className="watch-empty">No ban watches in effect.</div>
            ) : (
              banWatches.map((watch) => (
                <div className="watch-item" key={watch._id}>
                  <div className="watch-champion">{watch.champion}</div>
                  <div className="watch-detail">
                    Watching <b>{watch.bannedFrom}</b>
                  </div>
                  <div className="watch-countdown">{timeRemaining(watch.expiresAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      <div className="wrap">
        <header>
          <h1>THE BAN LIST</h1>
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
              <div className="autocomplete-field">
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
                  <ul className="autocomplete-suggestions">
                    {championMatches.map((name, i) => (
                      <li
                        key={name}
                        className={`autocomplete-suggestion${i === championHighlight ? ' active' : ''}`}
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
              <div className="autocomplete-field">
                <label htmlFor="bannedFrom">Banned From (Summoner)</label>
                <button
                  type="button"
                  id="bannedFrom"
                  className="autocomplete-trigger"
                  onClick={() => {
                    setBannedFromOpen((prev) => !prev);
                    setBannedFromHighlight(-1);
                  }}
                  onBlur={() => {
                    setBannedFromOpen(false);
                    setBannedFromError(!bannedFrom);
                  }}
                  onKeyDown={handleBannedFromKeyDown}
                >
                  <span className={bannedFrom ? '' : 'autocomplete-placeholder'}>
                    {bannedFrom || 'Select a name...'}
                  </span>
                </button>
                {bannedFromOpen && (
                  <ul className="autocomplete-suggestions">
                    {sortedUserNames.map((name, i) => (
                      <li
                        key={name}
                        className={`autocomplete-suggestion${i === bannedFromHighlight ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectBannedFromName(name);
                        }}
                        onMouseEnter={() => setBannedFromHighlight(i)}
                      >
                        {name}
                      </li>
                    ))}
                    <li
                      className={`autocomplete-suggestion add-new${
                        bannedFromHighlight === sortedUserNames.length ? ' active' : ''
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setBannedFromOpen(false);
                        openAddNameModal('main');
                      }}
                      onMouseEnter={() => setBannedFromHighlight(sortedUserNames.length)}
                    >
                      + Add new name…
                    </li>
                  </ul>
                )}
                {bannedFromError && (
                  <div className="field-error">Pick a name from the list.</div>
                )}
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
            Log in with Discord on the left before you can file a ban.
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
                <div className="case-champion">
                  <img
                    className="case-champion-icon"
                    src={championIconUrl(ban.champion)}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                  />
                  {ban.champion}
                </div>
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
              Permanently remove <b>{removeTarget.champion}</b> ({removeTarget.bannedFrom}) from the
              docket? This cannot be undone.
            </p>
            <form onSubmit={confirmRemoveBan}>
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

      {watchModalOpen && (
        <div className="modal-overlay" onClick={closeWatchModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Create Ban Watch</div>
            <p className="modal-text">
              Flag a champion/summoner pairing for the group to keep an eye on. It stays
              listed for 7 days.
            </p>
            <form onSubmit={submitBanWatch}>
              <div className="autocomplete-field">
                <label htmlFor="watchChampion">Champion</label>
                <input
                  id="watchChampion"
                  placeholder="Start typing a champion..."
                  autoComplete="off"
                  value={watchChampion}
                  onChange={(e) => {
                    setWatchChampion(e.target.value);
                    setWatchChampionOpen(true);
                    setWatchChampionHighlight(-1);
                    setWatchChampionError(false);
                  }}
                  onFocus={() => setWatchChampionOpen(true)}
                  onBlur={() => {
                    setWatchChampionOpen(false);
                    setWatchChampionError(watchChampion.trim() !== '' && !validWatchChampion);
                  }}
                  onKeyDown={handleWatchChampionKeyDown}
                  required
                />
                {watchChampionOpen && watchChampionMatches.length > 0 && (
                  <ul className="autocomplete-suggestions">
                    {watchChampionMatches.map((name, i) => (
                      <li
                        key={name}
                        className={`autocomplete-suggestion${i === watchChampionHighlight ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectWatchChampion(name);
                        }}
                        onMouseEnter={() => setWatchChampionHighlight(i)}
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
                {watchChampionError && (
                  <div className="field-error">Pick a champion from the list.</div>
                )}
              </div>

              <div className="autocomplete-field">
                <label htmlFor="watchBannedFrom">Summoner Being Banned</label>
                <button
                  type="button"
                  id="watchBannedFrom"
                  className="autocomplete-trigger"
                  onClick={() => {
                    setWatchBannedFromOpen((prev) => !prev);
                    setWatchBannedFromHighlight(-1);
                  }}
                  onBlur={() => {
                    setWatchBannedFromOpen(false);
                    setWatchBannedFromError(!watchBannedFrom);
                  }}
                  onKeyDown={handleWatchBannedFromKeyDown}
                >
                  <span className={watchBannedFrom ? '' : 'autocomplete-placeholder'}>
                    {watchBannedFrom || 'Select a name...'}
                  </span>
                </button>
                {watchBannedFromOpen && (
                  <ul className="autocomplete-suggestions">
                    {sortedUserNames.map((name, i) => (
                      <li
                        key={name}
                        className={`autocomplete-suggestion${i === watchBannedFromHighlight ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectWatchBannedFromName(name);
                        }}
                        onMouseEnter={() => setWatchBannedFromHighlight(i)}
                      >
                        {name}
                      </li>
                    ))}
                    <li
                      className={`autocomplete-suggestion add-new${
                        watchBannedFromHighlight === sortedUserNames.length ? ' active' : ''
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setWatchBannedFromOpen(false);
                        openAddNameModal('watch');
                      }}
                      onMouseEnter={() => setWatchBannedFromHighlight(sortedUserNames.length)}
                    >
                      + Add new name…
                    </li>
                  </ul>
                )}
                {watchBannedFromError && (
                  <div className="field-error">Pick a name from the list.</div>
                )}
              </div>

              {watchFormError && <div className="field-error">{watchFormError}</div>}

              <div className="modal-actions">
                <button type="button" className="modal-cancel-btn" onClick={closeWatchModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-confirm-btn" disabled={watchBusy}>
                  {watchBusy ? 'Creating…' : 'Create Ban Watch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Always rendered last so it stacks on top of the Create Ban Watch
          modal too, since either one can trigger it. */}
      {addNameOpen && (
        <div className="modal-overlay" onClick={closeAddNameModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add a Summoner Name</div>
            <p className="modal-text">
              Add a new name to the "Banned From" list so anyone can pick it going forward.
            </p>
            <form onSubmit={submitAddName}>
              <label htmlFor="newSummonerName">Summoner Name</label>
              <input
                id="newSummonerName"
                placeholder="e.g. Jake"
                autoFocus
                maxLength={50}
                value={addNameInput}
                onChange={(e) => setAddNameInput(e.target.value)}
                required
              />
              {addNameError && <div className="field-error">{addNameError}</div>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel-btn" onClick={closeAddNameModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-confirm-btn" disabled={addNameBusy}>
                  {addNameBusy ? 'Adding…' : 'Add Name'}
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
