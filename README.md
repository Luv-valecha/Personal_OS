# Lucifer's OS — V3.1.21

A minimal, fast, installable (PWA) personal operating system: tasks, calendar, deadlines, notes, bookmarks, projects, ideas, focus timer, expenses, files, developer projects, activity feed, global search, command palette, a customizable dashboard and **18 built-in themes + a custom theme builder**.

**JavaScript only (no TypeScript)** · Next.js 16 App Router · PostgreSQL · Tailwind CSS 4 + CSS variables · deployable on free tiers.

## What's new in V3.x (current: **3.1.21**)
V3 extends V2 — every V2/V1 module, the theme system, auth, PWA and project relationships are unchanged.

### 1. JARVIS — AI assistant on the dashboard
A compact input at the very top of the dashboard; the response panel exists only while there is a response (dismiss with ✕). Cards show the *real* result of each action with deep links.
* **How it works:** `POST /api/jarvis` (authenticated) → `lib/jarvis/orchestrator.js` → (1) a **deterministic rules path** for explicit commands (`add task: …`, `add idea: …`, `start 45 minute focus`, `Rahul owes me 300 for lunch`, `overdue`, `how much have I spent this month`…) — instant, no AI quota used, works with the AI down → (2) **Gemini function calling** for everything else. The model can only call tools from an explicit allow-list (`lib/jarvis/tools.js`); each tool has a strict Zod schema, uses the *session* user (never an id from the model/browser), goes through the same ownership-checked services as the UI (`lib/services.js`), and returns real data.
* **Tools:** tasks (create/list/update/complete/delete/bulk-complete-overdue), ideas (create/list/convert-to-task/delete), expenses (create/list/summary and **`get_expense_stats` — any metric**), splits (add entry/list balances/settle), deadlines, events, projects (list/overview/create), notes, bookmarks, search, focus (start/summary), priorities.
* **No invented numbers:** totals, counts, averages, dates and balances are computed in SQL/JS (`lib/analytics.js`, `lib/splits.js`); the model only phrases results. If a write tool fails, the UI shows the failure — never a model-claimed success.
* **Confirmation policy:** clear low-risk actions run immediately. Ambiguity (several projects match, missing amount/date, non-₹ currency) → one clarifying question; the next message completes the original request (short, bounded in-memory conversation: ≤ 8 messages, nothing stored server-side). **Deletes and bulk changes** return a preview + HMAC-signed, 5-minute, user-bound token; they only execute after you press Confirm.
* **Free-tier resilience:** ≤ 600-character input, 15 requests/min and 300/day per user (in-memory), 20 s timeout, bounded history, minimal rows sent to Gemini (never the whole database), same `requestId` ⇒ executed once (double-submit safe), quota/key/model/timeout/malformed-response errors are mapped to clear messages. JARVIS is optional: without a key the rest of the app is unaffected and the rule-based commands still work.
* **Ask for any expense metric**, e.g. “average coffee spend last 30 days”, “how much on weekends this month”, “compare this month to last month”, “my highest expense this year”, “daily average in September”. The model picks a date range/filters; the numbers come from `get_expense_stats` (total, count, avg/day, avg/expense, avg per active day, median, min/max, by category, by weekday, weekend-vs-weekday, 12-month trend, top expenses/items, change vs previous period, month-end forecast).

### 2. Task ordering (manual drag-and-drop + auto sort)
* Drag the ⋮⋮ handle (mouse, touch — press-and-hold briefly — or keyboard: Space, ↑/↓, Space) in the **Tasks page, dashboard widget and Today view** — they share one ordering. Persisted as `tasks.manual_position` (fractional key): a drag writes **one row**; priority/due date/status are never touched. New tasks appear at the top.
* **Sort** menu: Manual · Priority · Due date · Newest first · A–Z (stored in `dashboard_settings.task_sort`, shared everywhere). Auto sorts are display-only: your manual order is preserved and restored when you switch back; dragging is disabled outside Manual mode so the order can never become ambiguous.
* Concurrency: moves are serialised client-side, optimistic with rollback; the server verifies neighbours still exist/are in order and otherwise refuses (“The list changed — try again”) and the list refreshes. Positions are renumbered only when the gap gets too small.

### 3. Project ideas
* `ideas.project_id` (nullable; deleting a project keeps its ideas) and `tasks.source_idea_id` (nullable; deleting an idea keeps its tasks). One canonical record: edit it from **Ideas** or from the **project's Ideas section** (project dialog → add / open / edit).
* Ideas page: project filter (All · No project · Converted to tasks · each project) and a project picker when adding. **Create linked task** on any idea: prefilled title/notes, optional priority/due date (nothing invented), project carried over; the idea is kept and lists its linked tasks (multiple allowed). The task editor shows “Created from idea”.

### 4. Lucifer Music (local files only)
* Add files/folder from **this device**; audio never leaves the browser. The server (Neon) stores only metadata: title, artist, album, duration, file name/size, a `name|size` fingerprint, favourites and playlists (`music_tracks`, `music_playlists`, `music_playlist_tracks`). No audio column exists.
* One `<audio>` element lives in the app shell, so playback continues across navigation; compact **mini-player** (play/pause, prev/next, seek, queue) sits above the mobile nav. Library / Playlists (create, rename, delete, add, remove, reorder) / Favorites / Queue (reorder, remove, shuffle, repeat off/all/one, volume). Media Session API for lock-screen controls where supported.
* Tags are read locally (ID3v2 title/artist/album) with file-name fallbacks. **Unavailable files** show “not on this device” with *Locate* / *Re-link files*; entries are never silently removed. Chrome/Edge desktop remember file handles (re-open after restart; the browser may re-ask permission); Android/iOS/Firefox keep files only for the open tab and need re-linking next time. A playlist synced to another device needs that device to add the same files (matching by name + size).
* Browser limits: autoplay needs a tap; background playback depends on the OS/browser and is not guaranteed; unsupported/corrupt files show an error.

### 5. Expense analytics (Expenses page)
Presets (today, week, 7/30/90 days, this/last month, this year, all time) **and custom from/to**, category filter, “description contains” filter, URL-shareable. KPIs: total (± vs previous equal period), average per day / per expense / per spending day, median, highest/lowest, weekend vs weekday, no-spend days, month-end forecast. Charts (theme-aware SVG): daily bars, cumulative line, category donut, weekday pattern, 12-month trend; top expenses and most-spent-on items. Same engine as JARVIS (`lib/analytics.js`).

### 6. Split tracker (Splits)
Friends are **plain names** (nothing connected). A ledger per friend: *I paid/lent (they owe me)*, *They paid/lent (I owe them)*, *They paid me back*, *I paid them back* — each with date and **reason**. Balances = signed sum; **Settle up** records the payment that zeroes a friend; **Split equally** (you + selected friends, payer = you or a friend, optional “record my share as an expense”). Dashboard **Splits** widget, search integration, and JARVIS (“Rahul owes me 300 for lunch”, “who owes me?”, “settle up with Aman”).

### 7. Branding & version
New original **dark-fire flame logo** (`scripts/logo.js` → PNG/SVG icons via `npm run icons`, in-app `<Logo/>`, favicon, maskable and Apple icons). App/PWA version **3.1.21**: `package.json`, `manifest` (`version`), service-worker cache name (so installed copies update), Settings → About.

## Setup for V3

### Gemini (JARVIS) — optional
1. Create a free key at https://aistudio.google.com/apikey.
2. Local: put `GEMINI_API_KEY=…` (and optionally `GEMINI_MODEL=…`) in `.env.local`, restart. Production (Vercel): Project → Settings → Environment Variables → add both, redeploy. Never prefix with `NEXT_PUBLIC_`; the key stays server-side and is never logged or returned.
3. Model: `GEMINI_MODEL` (default `gemini-2.5-flash`). Model names and free quotas change — check https://ai.google.dev/gemini-api/docs/models and the rate-limit page, then set the id you want. “Model isn't available” errors tell you to change it.
4. Free tier: requests-per-minute/day and token quotas apply and can change; when exhausted JARVIS says so and the rule-based commands keep working. On the free tier Google may use prompts to improve its products — JARVIS therefore sends only your message, a short history and the few rows a tool returns.
5. Test: ask “what should I work on today?” (rule path, no key needed) and “how much did I spend on coffee in the last 30 days?” (needs the AI). Offline end-to-end test without a key: `npm run mock:gemini` + `GEMINI_API_BASE=http://localhost:4010 GEMINI_API_KEY=test npm run start`.
6. Replace the provider: implement `generate({system, contents, tools})` in `lib/jarvis/provider.js`.

### Neon PostgreSQL (database stays the same)
* No new database. Keep your existing `DATABASE_URL` (Neon: use the **pooled** connection string — host contains `-pooler` — with `sslmode=require`; the app already enables SSL for non-local hosts).
* **Free tier (checked Oct 2026 — re-verify):** Neon Free = 100 CU-hours and 0.5 GB per project per month, autoscaling to 2 CU, compute **scales to zero after ~5 min idle** (first query after idle takes a moment), no card needed; if a monthly limit is hit, compute is suspended until next month. All V3 metadata is tiny; note that the Files module stores uploads *inside* Postgres (counts toward 0.5 GB) — music files are never stored.
* **Migrate** (additive, idempotent, tracked in `_migrations`): `npm run db:migrate` → applies `003_v3.sql` (task ordering, idea↔project, idea→task link, music tables) and `004_splits.sql` (friends, split_entries). Production: run the same command locally with your production `DATABASE_URL` (or via a one-off shell) *before* the new code serves traffic, then verify with `npm run db:check`.
* **Back up first** (recommended): Neon console → Branches → create a branch from main (instant copy-on-write snapshot), or `pg_dump "$DATABASE_URL" > backup.sql`.
* **Preserved:** nothing is dropped or rewritten. Existing tasks get `manual_position` backfilled so the initial manual order equals your V2 Tasks-page order. Verified on a V2 database: row counts, task ids and user accounts identical after migrating.
* **Rollback considerations:** the code can run on the migrated schema; to roll back the *app*, redeploy V2 (extra columns/tables are ignored). To remove the new structures, restore the Neon branch/backup — we deliberately ship no destructive down-migration.

### Environment variables (new in V3)
| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | no | Enables JARVIS AI (server-only). |
| `GEMINI_MODEL` | no | Model id (default `gemini-2.5-flash`). |
| `GEMINI_API_BASE` | no | Testing/proxy override of the API URL. |
| `GEMINI_TIMEOUT_MS` | no | Request timeout (default 20000). |
All V2 variables are unchanged (`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `ALLOW_REGISTRATION`, `MAX_UPLOAD_MB`).

### Deploy (existing Vercel + Neon)
`npm install` → set env vars (add the Gemini ones if you want JARVIS) → `npm run db:migrate` against production → push to GitHub (Vercel builds with `npm run build`) → verify: sign in, `/manifest.webmanifest` shows version 3.1.21, Settings → About, dashboard JARVIS bar, Expenses analytics, Splits, Music (add a file), drag a task. Installed PWAs pick up the new service worker (cache `static-3.1.21`) on next open.

## Testing
* `npm test` — unit tests (`tests/unit`, Node's test runner): sorting/ordering, priority scoring, command parsing, JARVIS deterministic intents, layout migration, music helpers.
* `tests/mock-gemini.mjs` — scripted Gemini stand-in to exercise JARVIS offline.
* `tests/e2e/*.py` — the Playwright (Python) scripts used for browser verification (dev-only helpers, not part of the app; they expect the seed user and a local Postgres).
* What was verified for 3.1.21 (local Postgres, production build, headless Chromium incl. touch emulation): V2→V3 migration preserving data; drag reorder (one row written, fields untouched, persistence, auto-sort + restore, dashboard↔Tasks consistency, keyboard, stale/crossed neighbours, mobile); project ideas end-to-end incl. deletion semantics and isolation; JARVIS rule path, tool path, clarification + follow-up, confirmation (incl. tampered/other-user tokens), unknown-tool/invalid-argument/cross-user attempts, duplicate requestId, rate limit, provider failures (quota, bad model, malformed, timeout) — **using the mock Gemini**; expense analytics numbers vs SQL; splits ledger/settle/equal split/isolation; Music with real WAV files (play/pause/seek/volume/next/prev/shuffle/repeat/auto-advance, playlists, favourites, navigation persistence, reload → unavailable → re-link, corrupt file, no audio bytes sent to the server, no bytea column, mobile layout); PWA assets/version; V2 regression suites.
* **Not verified here:** the real Gemini API (no key/network in the sandbox — behaviour with real model output may differ; use the test steps above), real phone keyboards/devices, PWA install/standalone and background audio on real Android/iOS, Safari/Firefox, File System Access permission prompts (Chromium desktop), actual Vercel/Neon deployment.

## Known limitations (V3)
* Gemini free-tier quotas and model names change; real-model tool-calling quality isn't guaranteed. Rate limits are in-memory per server instance.
* Music: files are not synced between devices; persistent file access exists only in Chromium desktop; background playback is browser-dependent; ID3 artwork is not read.
* Splits: friends are names only (no accounts, no multi-currency, equal splits only); expenses are single-currency (₹).
* An intermittent, harmless React hydration warning (#418, text mismatch) has occasionally appeared in the browser console on the Settings page in production builds; it could not be reproduced in dev mode or on fresh loads, React recovers automatically, and no visible difference was found.
* Recurring tasks complete into the next occurrence; recurring calendar events aren't editable per occurrence (unchanged from V2).


## What's new in V2.0
V2 is an evolution of V1 — every V1 module, the theme system, auth, PWA and the project ↔ tasks/notes/deadlines/files relationships are unchanged.

* **Today cockpit** — a new **Today** view (tab next to *Dashboard*, also in the sidebar and `Ctrl+K`) answering “what should I do next?”: **Priority now** card, compact **timeline** (events + finished focus sessions + deadlines/tasks “anytime today”), today's tasks, deadlines this week, focus, things needing attention, and project work due today. *Priority now* and *Timeline* are also normal dashboard widgets (show/hide/reorder/resize still work); the overview card gained a “deadlines due” count.
* **Priority Now (no AI)** — deterministic score in `lib/priority.js`: overdue (very high, grows with days late) › due today › high priority › due tomorrow › due soon, plus bonuses for a high-priority / in-progress project, task age and “already worked on today”. It reuses the existing task priority and project fields. Optional per-task **estimate (minutes)** is shown as “~45 min estimated”. **Start focus** opens Focus, shows the task title, starts the timer (estimate, capped 5–90 min, else 25) and links the session to the task (`focus_sessions.task_id`); finishing records **one** session + one activity entry.
* **Command palette (Ctrl+K / ⌘K, search icon on mobile)** — suggestions when empty (continue where you left off, today's priorities, start focus on your priority, urgent deadlines, today's schedule, add quick link); smart queries (`overdue`, `today`, `urgent`) with live counts; scoped pickers (*Open project… / note… / task…*); grouped search across quick links, projects, tasks, notes, bookmarks, deadlines, files, ideas and activity (debounced 300 ms + 60 s client cache); theme list; *Start/Stop theme slideshow*.
  **Deterministic natural-language actions** (no LLM): `add task: finish ML report tomorrow` · `add idea: build an AI email organizer` · `add note: …` · `add project: …` · `add expense 250 food lunch` · `add deadline: DBMS friday` · `add event: Gym tomorrow 6pm` · `add bookmark github.com/x` · `add link: GitHub https://github.com` · `start 45 minute focus [on …]` · `open tasks`. Commands only run directly when an explicit verb is used and all required parts are understood; otherwise the structured form opens pre-filled (e.g. an event without a time). Parser: `lib/commands.js`.
* **Quick Links** — new widget (default on) + management in **Settings → Quick links**: add, edit, delete, pin/favourite, reorder (up/down buttons, keyboard accessible), category, description, 20 icons (or first-letter tile). Links can be external (`https://…`, new tab with `noopener`) or **internal** (`/tasks`, `/today`… client-side navigation). Only `http(s)` URLs and internal paths are accepted. Favicons are intentionally not fetched (third-party requests; blocked by the CSP). Quick links are searchable in `Ctrl+K` and global search.
* **Theme slideshow** — *Settings → Appearance → Theme slideshow*: on/off, choose any combination of built-in and your custom themes (≥ 2), interval 5 min → 24 h presets or custom (min 5 min), current / next / countdown, **skip, pause/resume, stop**. Stored per user in the database; the next-switch time is also stored, so it keeps working across refresh, logout/login, devices and PWA restarts. If a switch became due while the app was closed it is applied **on the server before the page renders** (no flash). Switching is a one-shot lightweight overlay (skipped with reduced-motion / animations Off) — no reload, no layout shift. A manual theme pick keeps the slideshow running and restarts its countdown.
* **Mobile note editor fix** — see below.

### Root cause of the mobile Note bug
`components/ui/Modal.jsx` ran its “focus first field + restore previous focus” effect with `onClose` in its dependency list. The note editor passed a *new* `close` function on every render, i.e. on every keystroke, so after each character the effect cleaned up (restoring focus to the element that was focused when the modal opened, blurring the textarea → keyboard closes) and re-ran (focusing the first input). Fix: `onClose` is kept in a ref, the effect depends only on `open`, and it never steals focus if the user is already inside the dialog. This also protects every other modal in the app. The note editor itself was not rewritten.

### Also fixed (found while testing)
* Finished focus sessions were never saved in V1 (SQL parameter typing error in `actions/focus.js`) — fixed; sessions are now recorded and linked to tasks.
* Login form no longer clears the email after a failed attempt.

## Upgrading from V1 to V2 (keeps all your data)
```bash
git pull   # or replace the project files with the V2 ones (keep your .env.local)
npm install
npm run db:migrate     # applies db/migrations/002_v2.sql — additive only
npm run build && npm run start      # or push to GitHub → Vercel redeploys
```
`002_v2.sql` only **adds**: table `quick_links`; columns `dashboard_settings.slideshow_*` (5), `tasks.estimate_minutes`, `focus_sessions.task_id`; indexes. Nothing is dropped or rewritten; re-running is safe. Existing users get the new widgets slotted into their saved dashboard layout automatically (a custom layout keeps its order). **Production (Vercel + Supabase):** run `npm run db:migrate` locally with your production `DATABASE_URL` *before/while* deploying. No new environment variables.

## Using the V2 settings
* **Today:** `/today` or the *Today* tab on the dashboard.
* **Quick links:** dashboard widget → *Add link* / *Manage*, or Settings → Quick links.
* **Theme slideshow:** Settings → Appearance → Theme slideshow (anchor `/settings#slideshow`).
* **Dashboard:** Settings → Dashboard → *Customize* / *Reset layout*.

## V2 testing notes
Verified against a local PostgreSQL with a production build and headless Chromium (desktop + Android-style touch emulation): V1 data preserved through the migration; mobile note typing (new, long, rotated, edit existing, quick-add sheet) with zero focus loss; Priority → Focus → one recorded session; palette suggestions/smart queries/natural-language actions; Quick Links CRUD, reorder, internal/external opening, user isolation; slideshow enable/skip/pause/resume/stop, timer-driven switching, server-side catch-up on load, persistence across logout/login, custom-theme participation, reduced motion; V1 regression (tasks, notes, markdown, pin/archive, bookmarks, expenses, uploads, projects, calendar, deadlines). **Not testable here:** real phone keyboards (emulated via focus tracking), real PWA install/standalone on a device, real service-worker offline behaviour on HTTPS, iOS Safari.

## Features
Dashboard (10 widgets: show/hide, reorder, resize, saved per user) · Tasks (quick natural-language add, subtasks, tags, recurrence, Today/Upcoming/Overdue/Completed/Projects views) · Calendar (day/week/month, recurrence, reminders) · Deadlines (colour urgency) · Notes (Markdown, code blocks, pin, archive, tags) · Bookmarks (auto title with graceful fallback) · Projects (progress, links, tasks/notes/files) · Ideas (+ random idea) · Focus (Pomodoro/custom, breaks, pause/resume, daily/weekly/total, runs across pages) · Expenses (day/week/month, categories, charts, budget) · Files (upload/download/delete) · Developer projects · Activity timeline (filter + paging) · Global search (debounced) · Ctrl/⌘+K command palette (mobile: search icon + “+” button) · Weather (Open-Meteo, no key, optional) · In-app notifications (+ optional browser alerts).

## Tech stack
Next.js 16 (App Router, Server Components, Server Actions, Route Handlers, `proxy.js`) · React 19 · `pg` (node-postgres, parameterised SQL) · SQL migrations in `db/migrations` · `jose` (signed JWT session cookie) · `bcryptjs` (cost 12) · Zod · Tailwind CSS 4 · lucide-react.

> **Why `pg` instead of Prisma?** Prisma needs to download native engines at install/migrate time and is heavier on serverless free tiers. Plain SQL + `pg` works everywhere, keeps cold starts small, and the whole schema is readable in one file.
> **Why custom auth instead of Auth.js/Supabase Auth?** Email+password with bcrypt and an httpOnly signed cookie is ~100 lines, has no third-party dependency, works on any host, and every query is scoped by `user_id`.

## Architecture
```
Browser ──► Next.js (Vercel free / any Node host)
             ├─ proxy.js            optimistic gate: no cookie → /login
             ├─ Server Components   read data (always filtered by the session user id)
             ├─ Client Components   interactivity only (modals, timer, palette…)
             ├─ Server Actions      all mutations (actions/*.js) → lib/crud.js
             ├─ Route Handlers      /api/search, /api/notifications, /api/files
             └─ lib/auth.js         JWT cookie, bcrypt, rate limiting
                        ▼
                  PostgreSQL (Supabase / Neon / local)
```
Security: DB credentials are server-only; every statement has `user_id = $n`; foreign keys (`project_id`, `task_id`) are ownership-checked; zod validation; markdown is rendered to React elements (no raw HTML); CSP + security headers; login/register rate limiting (in-memory, best effort on serverless); uniform login error (no account enumeration); downloads are `attachment` + `nosniff`; metadata fetching blocks private IPs (SSRF).

## Project structure
```
app/(auth)/login,register     public auth pages
app/(app)/<module>/page.js    one folder per module (server component → client component)
app/api/…                     search, notifications, files
actions/*.js                  server actions per module
components/{shell,ui,modules,dashboard,themes,tasks}
lib/                          db, auth, crud, queries, validation, themes, layout, dates, nlp, metadata
db/migrations/001_init.sql    full schema (indexes, FKs, pg_trgm)
scripts/                      migrate, seed, check-db, make-icons
styles/themes.css             ALL theme tokens        styles/globals.css  components consuming tokens
public/sw.js, app/manifest.js PWA
```

## Local development (fresh machine)
Requirements: Node 20+ and a PostgreSQL database.
```bash
cd personal-dashboard            # run every command from this folder (where package.json is)
npm install
cp .env.example .env.local       # then edit it (see Environment variables)
npm run db:migrate               # creates tables
npm run db:seed                  # optional demo data + demo user
npm run db:check                 # prints "Connected…" and "Tables exist"
npm run dev                      # http://localhost:3000
```
Seed login: **lucifer@example.com / lucifer123** (override with `SEED_EMAIL`, `SEED_PASSWORD`). Or just register a new account.
Production check locally: `npm run build && npm run start`.
Other commands: `npm run db:reset` (⚠ wipes the database, dev only), `npm run icons` (regenerate PNG icons).

## Database setup from zero (Neon or Supabase — any PostgreSQL works)
**Neon (recommended for V3):** create a project at neon.com → copy the *pooled* connection string → `DATABASE_URL` in `.env.local` → `npm run db:migrate`.

### Supabase variant
1. Create an account at supabase.com → **New project** → choose a region near you and set a **database password** (save it).
2. When ready, click **Connect** → copy the **Transaction pooler** connection string (port **6543**). Replace `[YOUR-PASSWORD]`. (For local migrations from home networks lacking IPv6, the pooler string is also the safest choice.)
3. Put it in `.env.local` as `DATABASE_URL=...`.
4. From the project folder run `npm run db:migrate` → you should see `✔ applied 001_init.sql`. (Migrations are tracked in a `_migrations` table, so re-running is safe.)
5. `npm run db:check` → `✔ Connected` and `✔ Tables exist`.
6. Optional: `npm run db:seed`.
You never need to understand Prisma — migrations are plain `.sql` files applied in filename order. To change the schema, add `002_something.sql`.

## Environment variables
| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (server only). Use the Supabase *transaction pooler* URL on Vercel. |
| `AUTH_SECRET` | yes | ≥ 32 random chars used to sign session cookies. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `NEXT_PUBLIC_APP_URL` | no | Public site URL (safe to expose). |
| `ALLOW_REGISTRATION` | no | Set `false` after creating your account so nobody else can sign up. |
| `MAX_UPLOAD_MB` | no | Upload limit (default and maximum 4 — Vercel functions cap request bodies at 4.5 MB). |
| `SEED_EMAIL` / `SEED_PASSWORD` | no | Only used by `db:seed`. **Required** (password) if you seed with `NODE_ENV=production`. |

Weather uses Open-Meteo and needs **no** API key.

## Free-tier facts (verified Oct 2026 from provider docs/pricing pages — re-check before relying on them)
| Service | Free limits that matter |
|---|---|
| **Supabase** (database) | 2 projects, **500 MB** database, 5 GB egress, 50k MAU; **projects pause after 7 days of inactivity** (you restore with one click in the dashboard; data is kept). |
| **Vercel Hobby** (hosting) | Personal / **non-commercial** use only, 1 developer, 100 GB bandwidth/month, serverless functions up to 300 s, **4.5 MB request/response body limit** (hence the 4 MB upload cap), cold starts on first request after idle. |
| Open-Meteo | Free for non-commercial use, no key. |

Consequences: files are stored inside Postgres (counts toward the 500 MB) — fine for documents, not for videos. For big files, replace the storage layer (see *Files storage*). Alternatives that also work with this code unchanged: **Neon** free Postgres (just paste its connection string) and **Render/Railway/any Node host** for Next.js.
Free databases that pause: the first request after a pause can fail with an error page; click **Try again** after restoring the project.

## Deployment (Vercel + Supabase, free)
1. Accounts: GitHub, Supabase, Vercel (sign in with GitHub).
2. Create the Supabase project and run `npm run db:migrate` locally against its pooler URL (steps above). This **is** the production migration (run it again whenever you add a migration file).
3. Generate `AUTH_SECRET` (command above).
4. Push to GitHub: `git init && git add . && git commit -m "init" && git branch -M main && git remote add origin <your-repo-url> && git push -u origin main` (`.env.local` is git-ignored — never commit it).
5. Vercel → **Add New → Project** → import the repo. Framework preset **Next.js**; build command `npm run build`, install `npm install` (defaults).
6. Add **Environment Variables**: `DATABASE_URL` (pooler string), `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` (your Vercel URL), `ALLOW_REGISTRATION=true` for now.
7. **Deploy.**
8. Create your account at `https://<your-app>.vercel.app/register`, then set `ALLOW_REGISTRATION=false` and redeploy. (Seeding production is optional: `SEED_PASSWORD=… NODE_ENV=production npm run db:seed` with your production `DATABASE_URL`.)
9. Custom domain (optional): Vercel → Settings → Domains.
10. **Verify**: register/login/logout work; a task created persists after refresh; `/manifest.webmanifest` and `/sw.js` load; Chrome shows *Install*; switch several themes and reload; open on your phone and check the bottom navigation.

## PWA
Manifest (`app/manifest.js`), original icons (`public/icons`, incl. maskable), `public/sw.js`, standalone display, themed status bar (the theme-color meta follows the active theme), shortcuts (Add task / Add note / Start focus). The service worker registers in **production** builds only.
* **Works offline:** the installed shell opens, static JS/CSS/icons are cached, an offline page explains the state.
* **Needs internet:** all data (pages, login, mutations, search, uploads, weather). HTML and API responses are *deliberately never cached* so private data can't leak between accounts on a shared device.
* **Install on Android (Chrome):** open the site → ⋮ → *Install app* (or the install banner). **Desktop Chrome/Edge:** install icon in the address bar. **iPhone:** Safari → Share → *Add to Home Screen*.

## Theme system
Components read only semantic tokens (`--color-background`, `--color-surface`, `--color-surface-elevated`, `--color-primary`, `--color-secondary`, `--color-accent`, `--color-text`, `--color-text-muted`, `--color-border`, `--shadow-card`, `--gradient-primary`, `--animation-speed`, plus `--radius`, `--bg-effect`). Each theme is a block of ~8 base values in `styles/themes.css` (`[data-theme="batman"] { --c-bg: … }`) — layout, navigation, forms and interactions are identical in every theme.
**Add a theme:** add a CSS block + one line in `lib/themes.js`. It appears in the selector automatically (preview cards render with their own tokens).
**Themes (18):** Light, Dark, AMOLED, Minimal · Marvel, Iron Man, Spider-Man, Moon Knight, Thor, Captain America, Hawkeye, Hulk, Venom · DC, Batman, Superman, Flash, Dr. Doom. Plus **custom themes** (colours, radius, card style, animation intensity, background effect; saved per user).
Identity comes from colour, type, one subtle background pattern (pure CSS/SVG, no copyrighted assets), a one-shot header accent animation on navigation, a theme-specific **loader** (arc-reactor, crescent, bat-signal, bolt, shield-star, speed streaks, gear, web, blob, crosshair…), and a one-shot **theme-switch transition**. Nothing loops except loaders.
**Animations:** Full / Reduced / Off in Settings, and the OS “reduce motion” setting is always honoured. Theme + motion are stored in the database (and mirrored in a cookie), so they survive refresh, logout/login and PWA restarts.
Fonts are system stacks (no external font requests); Moon Knight uses a serif stack for headings.

## Files storage
Default: PostgreSQL `bytea` (`app/api/files`). To use S3/R2/B2 or local disk later, change the INSERT in `app/api/files/route.js` and the SELECT in `app/api/files/[id]/route.js`; the `files.storage` column already records the backend. Cloudflare R2 (10 GB free) is the usual free option; direct-to-bucket uploads also remove the 4.5 MB limit.

## Troubleshooting
* **“AUTH_SECRET must be set…”** – add a ≥32-char `AUTH_SECRET` to `.env.local` / Vercel env and restart/redeploy.
* **`ECONNREFUSED` / “Could not sign in… database connection”** – database not running or wrong `DATABASE_URL`; run `npm run db:check`.
* **Supabase `ENOTFOUND` / timeouts** – use the *Transaction pooler* string (IPv4-friendly), check the project isn't paused.
* **“relation … does not exist”** – run `npm run db:migrate` against that database.
* **Pages show “Something went wrong”** – usually a paused free database; resume it and click *Try again*.
* **Upload fails** – file over 4 MB (free-tier limit) or offline.
* **Not installable** – PWA needs HTTPS (Vercel provides it) and a production build; `npm run dev` doesn’t register the service worker.
* **Stuck on an old version of the app after a deploy** – close and reopen the installed app, or clear site data.
* **Locked out by rate limit** – wait 15 minutes (limit is per server instance).

## Future integrations (extension points)
`events` and `expenses` already have `external_source` / `external_id` columns, and the dashboard is a widget registry (`lib/layout.js` + `components/dashboard/widgets.jsx`): a new card = one registry entry + one component.
* **HisaabKitaab** — add `app/api/integrations/hisaabkitaab/route.js` that fetches your app’s API (token in a server-only env var), plus a `splits` widget (“This month / You owe / You are owed”). Optionally import into `expenses` with `external_source='hisaabkitaab'`.
* **Streaming site / File sharing** — same pattern: server-side route handler calling their API, widget “Continue watching” / “Recent files”.
* **GitHub** — personal access token env var; route handler for latest commit / open PRs per `dev_projects.github_url`.
* **Google Calendar** — OAuth route handlers writing into `events` (`external_source='google'`); the calendar UI already renders any event.
* **AI “What should I focus on today?”** — a command-palette command calling a route handler that sends tasks, deadlines, events, projects and focus history (all available via `lib/queries.js`) to an LLM.

## Known limitations (honest list)
* Rate limiting is in-memory (per serverless instance); use an external store if you expose registration publicly.
* Recurring tasks create the next occurrence when completed; there is no per-occurrence editing of recurring calendar events.
* Browser alerts fire only while the app is open/installed (no push server — that would need paid/extra infrastructure).
* Quick-link favicons are not fetched (privacy/CSP); icons are chosen from a built-in set.
* Theme slideshow is evaluated when the app is open/loaded (no background push); it catches up at the next load.
* A rare React hydration warning (#418) has been observed in the browser console on Settings/Expenses in production builds; React recovers automatically and no visible difference was found.
