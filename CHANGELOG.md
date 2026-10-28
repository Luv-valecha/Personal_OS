# Changelog

## [4.0.1] — 2026-10
### Fixed
- **Microphone permission was never requested.** `next.config.js` sent `Permissions-Policy: microphone=()` (a V3 hardening default), which disables the microphone for the entire page: Chrome never showed its prompt and voice input failed immediately. Now `microphone=(self)`; camera and geolocation remain disabled and third-party frames still cannot use the mic.
- Voice input now requests permission explicitly (`getUserMedia`, stream released immediately) before listening, and distinguishes *prompt dismissed* ("tap the mic again and choose Allow"), *blocked* (exact steps to unblock), *no microphone*, *microphone in use*, and *page not allowed to use the microphone*. Cancelling while the prompt is open no longer starts listening afterwards.
- **Mini music player could not be dismissed on phones.** The ✕ was `hidden sm:inline-flex` (invisible on small screens) and, where visible, cleared the whole queue. The ✕ now shows at every width and dismisses the player **without clearing the queue** (pauses and hides; persisted across navigation/reload; any new playback brings it back). *Clear queue* is unchanged on the Music page.
### Changed
- Version 4.0.1 (package.json, service worker cache, manifest, README). No database migration.
### Verification
Unit tests 182 (18 new: every permission outcome with fake browser APIs, the real header value, music dismissal rules). Not verified: real Chrome/Safari permission dialogs and real audio (no browser in the build environment) — please confirm on your device.

## [4.0.0] — 2026-10
Upgrade of the existing PWA (V3.1.21 → 4.0.0). Additive migrations 006–010; no V3 feature removed.

### Added
- **JARVIS voice**: microphone input (browser speech recognition; text is reviewed before sending, never auto-submitted) and optional spoken replies (off by default, device voices only, stop button, voice/speed settings).
- **JARVIS memory** (`remember` / `list_memories` / `update_memory` / `forget_memory`), with a Settings page to view, add, edit and delete memories; secrets are rejected.
- **JARVIS intent-aware task filtering**: status, priority, project, scheduled/due date ranges, completion windows, search, sort, limit and counts — evaluated in the database.
- **JARVIS budget access** (`get_budget`) and per-user **currency** in expense/split answers.
- **JARVIS theme control** (`set_theme`, `list_themes`), **bug tools** (`create_bug`, `list_bugs`, `update_bug`), and **recurring-event tools** (`create_event` repeat options, `set_event_repeat`).
- **Hell theme** (WCAG-checked), registered through the existing theme system.
- **Project Bugs** section in every project; **Checklists** module (`/checklists`).
- **Optional task scheduled date**, separate from the due date.
- **`@project` syntax** for tasks, ideas and bugs, including multi-word names, with ambiguity/not-found handling.
- **Custom recurring events** (interval, weekdays, day of month / last day, yearly; end by date or count; per-occurrence edit/delete via `event_exceptions`).
- **Dashboard**: opt-in Music, Ideas, Open bugs and Checklists widgets; project filter on the tasks widget; optional glass look (Soft/Strong).
- **Redis cache (optional, Upstash REST)** for repeated read-only JARVIS answers and dashboard data, with per-user version-token invalidation, circuit breaker, status endpoint (`/api/cache/status`) and benchmark script.
- `lib/migrations-status.js`: Settings shows a "Database update needed" notice when a migration is pending.
- Docs: `REDIS_SETUP.md`, `TROUBLESHOOTING.md`, `.env.example`.

### Changed
- **Deleting a project now deletes everything it owns** (tasks, ideas, notes, deadlines, files, bugs, linked checklists) in one atomic statement; the confirmation lists counts. (V3 left them behind, unassigned.)
- Dashboard/Today/search deep-links open the editors for tasks, deadlines, events, notes and ideas (`?open=<id>`).
- Event expansion rewritten (`lib/recurrence.js`).
- Version identifiers (package.json, service worker cache, manifest, README) are now 4.0.0 and checked by a test.

### Fixed
- Tasks opened from the dashboard widget or Today view did nothing (no editor was wired).
- Quick-add silently created a task with **no project** when `@project` didn't match, and silently picked the oldest of several matches.
- JARVIS returned the same task list for different questions (only six fixed filters existed).
- Expenses and split entries could not be edited from the UI; files could not be renamed/re-tagged.
- Glass setting: the Settings control always showed "Off"; saving failed opaquely when its migration was pending and the layout then discarded the saved choice.
- Recurring events: a 09:00 daily event drifted an hour across daylight-saving changes; monthly Jan 31 became Mar 3; daily series older than ~2 years vanished from the calendar.
- Migrations 006/008 constraint lookups are now scoped to the table (robust with multiple schemas).

### Not included
- YouTube downloader (dropped by request). "This and following" recurrence edits. Setting the budget via JARVIS. Bug↔task links. "Switch back to my previous theme".

### Verification (development Postgres 16, local; no production access)
Unit 164 · DB integration 68 · live-app suites 22 + 29 + 18 + 19 + 28 · all 21 pages render · production build. **Not verified:** real Gemini, real Upstash, real microphone/speech output, real browser UI interaction, Vercel/Neon deployment. See README → Known limitations.
