# Multi-profile Support — Design Spec

**Date:** 2026-04-21
**Status:** Approved for implementation planning
**Area:** `sidepanel/` (Chrome Extension side panel UI and state)

## Summary

Lift the current 2-profile cap so the user can create, rename, switch between, and delete an unlimited number of profiles. The underlying data model already supports N profiles — the gate is a hardcoded cap in the "Add Profile" handler and the lack of any delete affordance. This change removes the cap, improves the add/new-profile naming, and adds a per-tab delete with safe fallbacks.

## Motivation

The app already migrated to an array-based `state.profiles` model and renders a multi-tab profile bar when more than one profile exists. But the UI artificially caps profiles at 2 with a toast error, and users cannot remove a profile they no longer want. Users who manage distinct career tracks (e.g., PM, SWE, Design) want more than two, and want to prune stale ones.

## Current State (as of this spec)

- `state.profiles: Profile[]` persisted under `SK.PROFILES = 'jt_profiles'`.
- `state.activeProfileId: string` persisted under `SK.ACTIVE_PROFILE = 'jt_active_profile_id'`.
- Each `Profile` carries its own `resumes`, contact fields, pre-answers, and `coverLetter` (pre-answer blob).
- Global (not per-profile) stores: `state.jobs`, `state.applications`, `state.coverLetters`, `state.analyses`.
- `activeApps()` filters applications by `profileId`, treating a missing/empty `profileId` as "visible on all profiles" (legacy backward-compat path).
- `renderProfileBar()` hides the bar when `profiles.length <= 1`.
- `btnAddProfile` handler at `sidepanel.js:~3325` hard-caps at 2 profiles and names the new profile `'Profile 2'`.
- `sidepanel.html:349` button label is `"+ 2nd Profile"`.

## Goals

- Allow an unlimited number of profiles.
- Let users delete a profile with clear consequences.
- Preserve application history tied to a deleted profile (un-tag, do not delete apps).
- Keep the existing profile bar, switching, and per-profile scoping untouched.

## Non-goals

- Changing how jobs, applications, or `state.coverLetters` are scoped.
- Inline rename on the tab itself. (Rename continues to flow through the Settings tab's "display name" field, which already edits the active profile.)
- Exporting/importing a single profile separately from the full data export.
- Hard cap on profile count. (Tab bar wrapping is a UI concern only at 6+ profiles; acceptable.)

## Design

### 1. Remove the cap, improve new-profile naming

**File:** `sidepanel/sidepanel.js`, handler for `#btnAddProfile` (~line 3325).

- Delete the guard `if (state.profiles.length >= 2) { toast('Maximum 2 profiles supported', ...); return; }`.
- Generate the default display name as `'Profile ' + (state.profiles.length + 1)` instead of the hardcoded `'Profile 2'`.
- Update the toast to reference the new profile's number (e.g., `` `${newP.displayName} created! Fill in the details below and save.` ``).

**File:** `sidepanel/sidepanel.html`, line 349.

- Change button text from `+ 2nd Profile` to `+ Add Profile`.

### 2. Delete affordance in the profile bar

**File:** `sidepanel/sidepanel.js`, `renderProfileBar()` (~line 156).

Each profile tab becomes:

```html
<button class="profile-tab-btn{active?}" data-action="switch-profile" data-profile-id="{id}">
  {displayName}
  <span class="profile-tab-delete" data-action="delete-profile" data-profile-id="{id}" title="Delete profile">×</span>
</button>
```

Rules:
- The `×` span is only rendered when `state.profiles.length > 1`. The last remaining profile cannot be deleted.
- Click on the `×` must not bubble into a switch. The existing delegate at `sidepanel.js:3428` narrowly matches `closest('[data-action="switch-profile"]')` — rewrite it to match `closest('[data-action]')` and branch: `if (action === 'delete-profile') deleteProfile(id); else if (action === 'switch-profile') switchActiveProfile(id);`. Because the `×` span is the inner-most `[data-action]`, `closest` resolves to it first and the switch path never runs.

**File:** `sidepanel/sidepanel.css`.

- Add minimal styles for `.profile-tab-delete`: small, muted, inline, hover turns red-ish. Sized so it doesn't inflate the tab height.

### 3. Delete handler

New function `deleteProfile(profileId)` in `sidepanel.js`, wired via the existing delegated click handler on `#profileTabs`.

Behavior:

1. Find the profile. If not found, no-op.
2. If `state.profiles.length <= 1`, toast "Can't delete the last profile" and return. (Defense in depth — the UI hides `×` in this case.)
3. Confirmation prompt (native `confirm()`):
   > `Delete "{displayName}"? Its resumes and cover letters will be removed. Applications will be kept but no longer tagged to this profile.`
4. On confirm:
   - Collect the deleted profile's `resumes[].id` into `deletedResumeIds` before removing the profile.
   - Remove the profile from `state.profiles`.
   - Clean `state.analyses`: delete any key matching `{resumeId}-*` where `resumeId ∈ deletedResumeIds`. Keys are `{resumeId}-{jobId}`.
   - Un-tag apps: for each `app` in `state.applications` with `app.profileId === profileId`, set `app.profileId = ''`. They then flow through the legacy `activeApps()` path and appear on every remaining profile.
   - If the deleted profile was active: set `state.activeProfileId = state.profiles[0].id`.
   - Persist: `save(SK.PROFILES, state.profiles)`, `save(SK.APPLICATIONS, state.applications)`, `save(SK.ANALYSES, state.analyses)`, and if the active changed, `save(SK.ACTIVE_PROFILE, state.activeProfileId)`.
   - `syncActiveProfileToState()` to reload the (possibly new) active profile's resumes into `state.resumes`.
   - `renderProfileBar()` and re-render whichever tab is currently visible (Resumes / Applications / Settings / Dashboard / Analyze / Cover Letters). Mirror the pattern used by `switchActiveProfile` at `sidepanel.js:177`.
5. Toast success.

### 4. Data flow / storage impact

- `SK.PROFILES` (`jt_profiles`) — array shrinks by one.
- `SK.ACTIVE_PROFILE` (`jt_active_profile_id`) — updated only if the deleted profile was active.
- `SK.APPLICATIONS` (`jt_applications`) — updated only if any app had the deleted `profileId`.
- `SK.ANALYSES` (`jt_analyses`) — updated only if any analysis keyed off the deleted profile's resumes.
- `SK.COVER_LETTERS` (`jt_cover_letters`) / `state.coverLetters` — **untouched**. This list is already global (not profile-scoped), and pulling in that scope change widens this spec unnecessarily.
- The profile's own embedded `coverLetter` pre-answer goes away with the profile object itself.

### 5. Files touched

- `sidepanel/sidepanel.js` — add-handler rewrite, `renderProfileBar()` update, new `deleteProfile()`, delegated click wiring on `#profileTabs`.
- `sidepanel/sidepanel.html` — button label at line 349.
- `sidepanel/sidepanel.css` — `.profile-tab-delete` styling.

No changes to: `background/service_worker.js`, `content/content.js`, `manifest.json`, `lib/pdf.min.js`.

## Risks & Edge Cases

- **Deleting the active profile while on any tab.** Handled: switch to `profiles[0]`, then re-render the current tab the same way `switchActiveProfile` does.
- **Analyses orphaning.** Without cleanup, `state.analyses` would grow with unreachable `{resumeId}-{jobId}` entries. Cleanup is a targeted `delete` by resumeId prefix, cheap and safe.
- **Applications for a deleted profile.** Intentionally kept; `profileId` is cleared so they surface on all remaining profiles via the existing legacy path.
- **Tab bar overflow with many profiles.** Acceptable at 5-ish profiles; if the user creates 10+, tabs wrap. Not in scope to redesign.
- **Confirmation races.** `confirm()` is synchronous and blocking; no race window with storage writes.

## Testing Plan (manual)

1. **Add cap removed.** Start with 1 profile → add a 2nd → add a 3rd and 4th. Each adds a profile numbered sequentially. Tab bar shows 4 tabs.
2. **Switch still works.** Click each tab; correct profile's resumes and apps appear.
3. **Delete non-active profile.** Delete Profile 3 while on Profile 1. Confirm. Profile 3's resumes disappear from its (now absent) view. Apps previously tagged to Profile 3 now appear on Profiles 1, 2, 4.
4. **Delete the active profile.** Switch to Profile 2, delete it. UI switches to Profile 1 (first in list). No errors.
5. **Delete the last profile is blocked.** Remove profiles until only 1 remains. The `×` is not rendered; profile bar hides anyway per existing `profiles.length <= 1` rule.
6. **Analyses cleanup.** Create an analysis for a resume on Profile 2, delete Profile 2, reload extension, verify `chrome.storage.local.get('jt_analyses')` no longer contains the orphaned key.
7. **Storage persistence.** After each of the above, reload the side panel and confirm state reloads correctly.
8. **Legacy apps (no `profileId`) unaffected.** An app with empty `profileId` continues to appear on all profiles.

## Memory Update

`/Users/mohakgarg/.claude/projects/-Users-mohakgarg-Desktop-Plugin/memory/MEMORY.md` currently says "Dual-profile support". Update to "Multi-profile support (N profiles, add/delete/switch; rename via Settings display name)".
