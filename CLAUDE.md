# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Log Chasers Timeline" tracks collection log progress for an OSRS (Old School RuneScape) clan
(TempleOSRS group id `2802`, "Log Chasers"). A scheduled job pulls each member's collection log
item counts from the TempleOSRS API, diffs them against the previous snapshot, and commits the
result as JSON into `data/`. A static single-page app (`index.html`) reads that JSON directly
(no build step, no backend) to show a timeline of snapshots, per-member item-gain history, and
clan events.

## Tech stack

- Plain Node.js script (`download.js`) using only built-in `fs`/`https` — no dependencies.
- Static frontend: a single `index.html` with inline `<style>`/`<script>`, vanilla JS, hash-based
  routing. No framework, no bundler, no `node_modules`.
- Data persisted as committed JSON files under `data/`, updated by GitHub Actions.

## Key directories

- `download.js` — the snapshot job. Fetches items + group collection log from TempleOSRS,
  diffs against prior state, writes/updates files under `data/`.
- `index.html` — the entire frontend (markup, CSS, and JS in one file).
- `data/items.json` — item id → item name map (from TempleOSRS `collection-log/items.php`).
- `data/clan_history.json` — ordered list of snapshot `runs`; each run has a `timestamp`,
  `members_added`, `members_removed`, and `member_deltas` (player → itemId → amount gained
  since the previous run). This is the file the frontend loads for the timeline view.
- `data/members/<player>.json` — per-player history as a list of `snapshots`, each storing only
  the *changed* items for that snapshot (delta-encoded, not a full item map — see
  `diffChangedItems`/`reconstructItems` in `download.js`).
- `data/group_clogs/2802.json` — raw last-fetched API response for the group (not diffed).
- `data/events.json` — manually maintained list of clan events (name, description, start/end,
  participant player names), rendered as the "Events" tab.
- `.github/workflows/daily-download.yml` — runs `download.js` and commits/pushes any changes
  under `data/`. The cron trigger is currently commented out; only `workflow_dispatch` is active.

## Commands

- `npm run download` — run `download.js` to fetch a new snapshot and update `data/`. Requires
  network access to `templeosrs.com`; writes files in place, so check `git status` after running
  to review the diff before committing.
- `npm start` — serve the repo locally (`npx serve .`) so `index.html` can `fetch()` the `data/*`
  JSON files (opening `index.html` directly via `file://` will not work due to `fetch` CORS
  restrictions).
- There is no test suite, linter, or build step in this repository.

## Data model notes

- Snapshot timestamps are formatted as `YYYY-MM-DDTHH-MM-SS` (colons replaced with hyphens for
  filesystem/URL friendliness) — see `getTimestamp()` in `download.js` and the inverse parsing in
  `parseTs()` in `index.html`.
- A member's *current* item counts are never stored directly — they must be reconstructed by
  replaying that member's `snapshots[].delta` in order (`reconstructItems()` in `download.js`,
  mirrored by client-side logic in `index.html`). A delta value of `0` means the item was present
  before and is no longer reported by the source API (not that the player owns zero).
  See the comment above `diffChangedItems()` in `download.js` for why this encoding was chosen.
- On a member's *first-ever* appearance with existing items, those items are recorded as a
  baseline snapshot, not as "gains" — avoids crediting a burst of fake item gains when a player's
  collection log first becomes visible/synced on TempleOSRS.
- Frontend routing is hash-based (`#/timeline`, `#/snapshot/<ts>`, `#/members`,
  `#/member/<player>/<ts>`, `#/events`, `#/event/<slug>`), parsed/dispatched in `parseRoute()` /
  `applyRoute()` in `index.html`. There is no server-side routing to configure.
