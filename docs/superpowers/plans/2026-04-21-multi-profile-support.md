# Multi-profile Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the 2-profile cap in the side panel UI, auto-number new profiles, and let users delete a profile (with a per-tab `×`) that wipes its resumes / cover letters and un-tags its applications so history stays visible on remaining profiles.

**Architecture:** Pure UI + state changes in `sidepanel/`. The data model (`state.profiles: Profile[]`) already supports N profiles; this plan removes the artificial cap in the Add handler, adds a delete flow in `renderProfileBar()` + a new `deleteProfile()` function, broadens the delegated click handler on `#profileBar` to dispatch both actions, and cleans up orphan `state.analyses` entries. Storage keys, `switchActiveProfile`, and per-profile scoping are untouched.

**Tech Stack:** Vanilla JS (no build step), Chrome Extension Manifest V3, `chrome.storage.local`. No test framework in repo — verification is manual via `chrome://extensions` "Reload" + side-panel clicks.

**Spec:** `docs/superpowers/specs/2026-04-21-multi-profile-support-design.md`

---

## Pre-flight

- [ ] **Step 0: Confirm the starting branch**

Run: `git status && git log -1 --oneline`
Expected: branch `jobright-indeed-support`, HEAD at the commit that added the spec (`Add design spec for multi-profile support`). Working tree has pre-existing modifications in `background/service_worker.js`, `content/content.js`, `sidepanel/sidepanel.js` — leave those alone. Only the files this plan names should be touched.

---

### Task 1: Rename the Add-Profile button label

**Files:**
- Modify: `sidepanel/sidepanel.html:349`

- [ ] **Step 1: Change the button text**

Edit `sidepanel/sidepanel.html`. Locate line 349:

```html
<button class="btn-sm btn-ghost" id="btnAddProfile" style="white-space:nowrap;flex-shrink:0">+ 2nd Profile</button>
```

Change to:

```html
<button class="btn-sm btn-ghost" id="btnAddProfile" style="white-space:nowrap;flex-shrink:0">+ Add Profile</button>
```

- [ ] **Step 2: Manual verification**

1. Open `chrome://extensions`, click **Reload** on JobTrack AI.
2. Open the side panel, go to **Settings** tab.
3. In the "My Profile" card, confirm the button reads **"+ Add Profile"**.

- [ ] **Step 3: Commit**

```bash
git add sidepanel/sidepanel.html
git commit -m "Rename add-profile button to '+ Add Profile'"
```

---

### Task 2: Lift the 2-profile cap and auto-number new profiles

**Files:**
- Modify: `sidepanel/sidepanel.js` (the `#btnAddProfile` click handler, currently ~lines 3325-3343)

- [ ] **Step 1: Locate the handler**

Run: `grep -n "btnAddProfile" sidepanel/sidepanel.js`
Expected: one match in the form `document.getElementById('btnAddProfile').addEventListener(...)`.

- [ ] **Step 2: Replace the handler**

Replace the entire existing handler block. Current code:

```js
  document.getElementById('btnAddProfile').addEventListener('click', async () => {
    if (state.profiles.length >= 2) { toast('Maximum 2 profiles supported', 'error', 2000); return; }
    const newP = {
      id: 'profile_' + Date.now(), displayName: 'Profile 2',
      firstName: '', lastName: '', email: '', phone: '',
      linkedin: '', github: '', portfolio: '',
      city: '', state: '', country: '', zipCode: '',
      salary: '', availability: '',
      whyThisRole: '', aboutMe: '', strength: '', weakness: '', coverLetter: '',
      resumes: []
    };
    state.profiles.push(newP);
    state.activeProfileId = newP.id;
    await chrome.storage.local.set({ [SK.PROFILES]: state.profiles, [SK.ACTIVE_PROFILE]: newP.id });
    syncActiveProfileToState();
    renderProfileBar();
    renderSettings();
    toast('Profile 2 created! Fill in the details below and save.', 'success', 4000);
  });
```

Replace with:

```js
  document.getElementById('btnAddProfile').addEventListener('click', async () => {
    const nextNumber = state.profiles.length + 1;
    const displayName = 'Profile ' + nextNumber;
    const newP = {
      id: 'profile_' + Date.now(), displayName,
      firstName: '', lastName: '', email: '', phone: '',
      linkedin: '', github: '', portfolio: '',
      city: '', state: '', country: '', zipCode: '',
      salary: '', availability: '',
      whyThisRole: '', aboutMe: '', strength: '', weakness: '', coverLetter: '',
      resumes: [], coverLetters: []
    };
    state.profiles.push(newP);
    state.activeProfileId = newP.id;
    await chrome.storage.local.set({ [SK.PROFILES]: state.profiles, [SK.ACTIVE_PROFILE]: newP.id });
    syncActiveProfileToState();
    renderProfileBar();
    renderSettings();
    toast(`${displayName} created! Fill in the details below and save.`, 'success', 4000);
  });
```

Two changes from the original:
1. Dropped the `>= 2` guard and `toast('Maximum 2 profiles supported'...)` line.
2. `displayName` computed from `state.profiles.length + 1` so new profiles are numbered 2, 3, 4, ….
3. Added `coverLetters: []` so new profiles start with an empty per-profile cover-letter list (matches the shape read by `syncActiveProfileToState` at line 148 and written by `saveCoverLetters`).
4. Toast message uses the computed `displayName`.

- [ ] **Step 3: Manual verification — add 3+ profiles**

1. Reload the extension.
2. Open side panel → **Settings**.
3. Click **+ Add Profile** three times.
4. Confirm the profile bar at the top now shows four tabs: the original, then `Profile 2`, `Profile 3`, `Profile 4`. (Bar only appears once `profiles.length > 1`, already true.)
5. Open DevTools → Application → Storage → Extensions → JobTrack AI → Local Storage. Expand `jt_profiles`: confirm four entries with unique `id` and `displayName` values.

- [ ] **Step 4: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "Remove 2-profile cap and auto-number new profiles"
```

---

### Task 3: Render the per-tab delete affordance

**Files:**
- Modify: `sidepanel/sidepanel.js` → `renderProfileBar()` at line 156
- Modify: `sidepanel/sidepanel.css` (append styles for `.profile-tab-delete`)

- [ ] **Step 1: Update `renderProfileBar()`**

Current body (lines 156-166):

```js
function renderProfileBar() {
  const bar = document.getElementById('profileBar');
  if (state.profiles.length <= 1) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  document.getElementById('profileTabs').innerHTML = state.profiles.map(p =>
    `<button class="profile-tab-btn${p.id === state.activeProfileId ? ' active' : ''}"
             data-action="switch-profile" data-profile-id="${p.id}">
       ${escHtml(p.displayName)}
     </button>`
  ).join('');
}
```

Replace with:

```js
function renderProfileBar() {
  const bar = document.getElementById('profileBar');
  if (state.profiles.length <= 1) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const showDelete = state.profiles.length > 1;
  document.getElementById('profileTabs').innerHTML = state.profiles.map(p =>
    `<button class="profile-tab-btn${p.id === state.activeProfileId ? ' active' : ''}"
             data-action="switch-profile" data-profile-id="${p.id}">
       <span class="profile-tab-label">${escHtml(p.displayName)}</span>
       ${showDelete ? `<span class="profile-tab-delete" data-action="delete-profile" data-profile-id="${p.id}" title="Delete profile">×</span>` : ''}
     </button>`
  ).join('');
}
```

Notes:
- `showDelete` is redundant today (the function already returns early when `profiles.length <= 1`) but keeps the intent self-documenting and guards against future refactors that move the early return.
- Wrapping the display name in `<span class="profile-tab-label">` lets us apply small CSS to space it from the `×` without changing the hit target of the parent button.

- [ ] **Step 2: Append CSS**

Append to the end of `sidepanel/sidepanel.css`:

```css
/* ── Profile tab delete affordance ──────────────────────────── */
.profile-tab-btn { display: inline-flex; align-items: center; gap: 6px; }
.profile-tab-label { line-height: 1; }
.profile-tab-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  color: inherit;
  opacity: 0.55;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s, color 0.15s;
}
.profile-tab-delete:hover {
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
  opacity: 1;
}
.profile-tab-btn.active .profile-tab-delete { color: white; }
.profile-tab-btn.active .profile-tab-delete:hover { background: rgba(255,255,255,0.25); color: white; }
```

- [ ] **Step 3: Manual verification — tabs render with `×`**

1. Reload the extension.
2. Confirm each tab shows the name followed by a small `×` on the right.
3. Hover the `×` on a non-active tab: it should darken to red-ish. Hover on the active tab: it should show a subtle white background.
4. Clicking the `×` today still triggers a switch (delete wiring comes in Task 5). This is expected at this checkpoint.

- [ ] **Step 4: Commit**

```bash
git add sidepanel/sidepanel.js sidepanel/sidepanel.css
git commit -m "Render per-tab delete affordance in profile bar"
```

---

### Task 4: Add `deleteProfile()` function

**Files:**
- Modify: `sidepanel/sidepanel.js` (insert after `switchActiveProfile`, immediately before the next top-level declaration — around line 190)

- [ ] **Step 1: Locate insertion point**

Run: `grep -n "async function switchActiveProfile" sidepanel/sidepanel.js`
Note the line number. The function ends with a closing `}` followed by a blank line. Insert the new function in that blank line.

- [ ] **Step 2: Add the function**

Insert the following block **immediately after** the closing `}` of `switchActiveProfile`:

```js
async function deleteProfile(profileId) {
  if (state.profiles.length <= 1) {
    toast("Can't delete the last profile", 'error', 2000);
    return;
  }
  const idx = state.profiles.findIndex(x => x.id === profileId);
  if (idx === -1) return;
  const target = state.profiles[idx];

  if (!confirm(`Delete "${target.displayName}"? Its resumes and cover letters will be removed. Applications will be kept but no longer tagged to this profile.`)) return;

  const deletedResumeIds = (target.resumes || []).map(r => r.id);

  state.profiles.splice(idx, 1);

  // Un-tag applications so they survive and appear on all remaining profiles
  // (matches the legacy `!a.profileId` path used by activeApps()).
  let appsChanged = false;
  state.applications.forEach(a => {
    if (a.profileId === profileId) { a.profileId = ''; appsChanged = true; }
  });

  // Drop orphaned analyses keyed `{resumeId}-{jobId}` for deleted resumes.
  let analysesChanged = false;
  if (deletedResumeIds.length) {
    const dropSet = new Set(deletedResumeIds);
    Object.keys(state.analyses).forEach(key => {
      const resumeId = key.split('-')[0];
      if (dropSet.has(resumeId)) { delete state.analyses[key]; analysesChanged = true; }
    });
  }

  const activeChanged = state.activeProfileId === profileId;
  if (activeChanged) state.activeProfileId = state.profiles[0].id;

  await save(SK.PROFILES, state.profiles);
  if (activeChanged)   await save(SK.ACTIVE_PROFILE, state.activeProfileId);
  if (appsChanged)     await save(SK.APPLICATIONS, state.applications);
  if (analysesChanged) await save(SK.ANALYSES, state.analyses);

  if (activeChanged) syncActiveProfileToState();
  renderProfileBar();
  renderDashboard();
  const t = state.activeTab;
  if (t === 'resumes')      renderResumes();
  if (t === 'tracker')      renderTracker();
  if (t === 'jobs')         renderJobs();
  if (t === 'analyze')      renderAnalyze();
  if (t === 'settings')     renderSettings();
  if (t === 'coverletters') renderCoverLetters();

  toast(`${target.displayName} deleted`, 'success', 2500);
}
```

Two things to double-check while editing:

1. **Tab re-render list.** The list above mirrors the tabs handled in `switchActiveProfile` (lines 179-188) plus Settings and Cover Letters (which aren't in `switchActiveProfile` but are profile-sensitive — the Settings form reads `activeP.*` fields, and Cover Letters reads `state.coverLetters` which is per-profile). Use the exact tab ID strings that exist elsewhere in the file. Run `grep -n "state.activeTab ===\|if (t ===" sidepanel/sidepanel.js` to verify IDs if unsure.
2. **Analyses key shape.** The key format is `{resumeId}-{jobId}`. Verify by running `grep -n "state.analyses\[" sidepanel/sidepanel.js | head -5`. Keys are composed with `${resumeId}-${jobId}` — `split('-')[0]` is safe because the IDs generated by `uid()` don't contain hyphens. If the existing code ever uses a different separator (e.g. `_`), update the split accordingly.

- [ ] **Step 3: Manual smoke — function is callable**

1. Reload the extension. Open the side panel and open DevTools on it (right-click inside the panel → Inspect).
2. In the console: `typeof deleteProfile` → should log `"function"`.
3. Don't invoke it yet — wiring comes in Task 5.

- [ ] **Step 4: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "Add deleteProfile() to remove a profile and clean orphan data"
```

---

### Task 5: Wire the delegated click handler to dispatch delete + switch

**Files:**
- Modify: `sidepanel/sidepanel.js` (the `#profileBar` click delegate, currently ~lines 3427-3431)

- [ ] **Step 1: Locate the delegate**

Run: `grep -n "Profile bar switching" sidepanel/sidepanel.js`
Note the line. The block below the comment is:

```js
  // Profile bar switching
  document.getElementById('profileBar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="switch-profile"]');
    if (btn) switchActiveProfile(btn.dataset.profileId);
  });
```

- [ ] **Step 2: Broaden it to dispatch by action**

Replace with:

```js
  // Profile bar: switch or delete based on which element was clicked
  document.getElementById('profileBar').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.profileId;
    if (action === 'delete-profile') deleteProfile(id);
    else if (action === 'switch-profile') switchActiveProfile(id);
  });
```

Why this works without `stopPropagation`: the `×` span has `data-action="delete-profile"` and is nested inside the tab button with `data-action="switch-profile"`. `e.target.closest('[data-action]')` starts at the span and returns it first, so the click on the `×` dispatches to `deleteProfile` and never reaches the switch branch.

- [ ] **Step 3: Manual verification — delete flow**

1. Reload the extension.
2. Make sure you have at least 3 profiles (add more via **+ Add Profile** in Settings if needed).
3. Click the `×` on the **Profile 2** tab. A browser confirm dialog reads:
   > `Delete "Profile 2"? Its resumes and cover letters will be removed. Applications will be kept but no longer tagged to this profile.`
4. Click **OK**. A green toast reads `Profile 2 deleted`. The tab disappears from the bar.
5. DevTools → Local Storage → `jt_profiles`: confirm `Profile 2` is gone.
6. Add another new profile (it should be numbered `Profile 3` — `state.profiles.length + 1` after deletion, which may or may not match pre-delete numbering depending on what was deleted; that's expected).

- [ ] **Step 4: Manual verification — delete active profile**

1. Switch to another profile (e.g., `Profile 3`) by clicking its tab.
2. Click its `×`, confirm. The UI should switch to `profiles[0]` automatically.
3. Confirm the Resumes / Applications / Settings tabs re-render with the remaining profile's data (no stale "Profile 3" display name visible in Settings).

- [ ] **Step 5: Manual verification — last-profile guard**

1. Delete profiles until only one remains.
2. Confirm the profile bar hides entirely (existing `profiles.length <= 1` rule).
3. The `×` is not rendered on the single remaining profile (there's no bar to click anyway).

- [ ] **Step 6: Manual verification — app un-tagging**

1. Add a second profile. Switch to it. Save a resume. Go to a job page and "Mark as applied" against that resume. This creates an application with `profileId` = the new profile's id.
2. Back in the side panel, open the **Tracker** tab — the new application is visible.
3. Switch to the original profile. Confirm the application is **not** visible on the Tracker (it's tagged to the other profile).
4. Switch back to the new profile, delete it, confirm.
5. Open the Tracker on the remaining profile — the application now appears (legacy path: empty `profileId` is visible on all profiles).
6. DevTools → Local Storage → `jt_applications`: confirm the app's `profileId` is `""`.

- [ ] **Step 7: Manual verification — analyses cleanup**

1. With two profiles, switch to Profile 2. Run **Deep Analysis** on some resume+job pair. Inspect `jt_analyses`: confirm a key like `{profile2_resume_id}-{job_id}` exists.
2. Delete Profile 2.
3. Inspect `jt_analyses`: confirm that key is gone. Keys belonging to the surviving profile's resumes are untouched.

- [ ] **Step 8: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "Wire profile tab delete via broadened click delegate"
```

---

### Task 6: Update MEMORY.md note about profile support

**Files:**
- Modify: `/Users/mohakgarg/.claude/projects/-Users-mohakgarg-Desktop-Plugin/memory/MEMORY.md`

- [ ] **Step 1: Update the known-design-decisions section**

Open the file and locate:

```
- Dual-profile support: each profile has its own resumes array
```

Replace with:

```
- Multi-profile support: N profiles (add via Settings → "+ Add Profile", delete via × on the tab, switch via the tab bar). Each profile has its own resumes and coverLetters. On delete: profile + its resumes/coverLetters removed; applications are un-tagged (profileId → "") so they stay visible on all remaining profiles via activeApps() legacy path; orphan jt_analyses keys for deleted resumes are cleaned up.
```

No git commit — this file is outside the project repo.

---

## Final Verification Checklist

Run after all tasks are complete, starting from a clean extension reload:

- [ ] Start with a single profile. Profile bar is hidden. Add a second profile via **+ Add Profile** — bar appears with 2 tabs, no `×` on the first tab until the second exists (bar hidden at n=1), both `×`es visible at n=2.
- [ ] Add profiles 3 and 4. All named `Profile 2`, `Profile 3`, `Profile 4` (given the original was `Profile 1` or a renamed one).
- [ ] Click a non-active tab's label → switches. Click that tab's `×` → confirm → deletes.
- [ ] Delete the currently-active tab → UI auto-switches to `profiles[0]` with no errors in DevTools console.
- [ ] Reload the extension. State persists: same set of profiles, same active profile.
- [ ] Legacy apps with empty `profileId` continue to appear on every remaining profile.
- [ ] Rename the active profile via Settings → `pDisplayName` → Save. Tab label updates after `renderProfileBar()` runs.

---

## Self-Review Notes (written at plan time)

- **Spec coverage:** Every spec section maps to a task — cap removal (Task 2), button label (Task 1), delete UI (Task 3), delete handler (Task 4), click wiring (Task 5), memory note (Task 6). Testing Plan items 1-8 are covered by Task 5 Steps 3-7 and the Final Verification Checklist.
- **Placeholder scan:** No TBDs. Every step shows either the exact code or the exact manual action. Tab re-render list in Task 4 Step 2 is concrete; the `grep` fallback is for the implementer's confidence, not a placeholder.
- **Type consistency:** Function name is `deleteProfile` throughout (Task 4 defines, Task 5 calls). Storage keys use the existing `SK.*` constants. `save()` is the existing one-liner wrapper at line 90 (`const save = async (key, val) => chrome.storage.local.set({ [key]: val });`).
- **Known soft spot:** Tab IDs in Task 4 Step 2 (`'resumes'`, `'tracker'`, `'jobs'`, `'analyze'`, `'settings'`, `'coverletters'`) must match what `switchTab(...)` sets `state.activeTab` to. The first four are confirmed against `switchActiveProfile` at `sidepanel.js:179-188`. Settings and Cover Letters should be verified by grep during Task 4 — the step calls that out.
