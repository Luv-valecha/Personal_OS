# Personal Dashboard — Lucifer's personal OS

A minimal, fast, installable (PWA) personal operating system: tasks, calendar, deadlines, notes, bookmarks, projects, ideas, focus timer, expenses, files, developer projects, activity feed, global search, command palette, a customizable dashboard and **18 built-in themes + a custom theme builder**.

**JavaScript only (no TypeScript)** · Next.js 16 App Router · PostgreSQL · Tailwind CSS 4 + CSS variables · deployable on free tiers.

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

## Database setup from zero (Supabase)
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
* A rare React hydration warning (#418) has been observed in the browser console on Settings/Expenses in production builds; React recovers automatically and no visible difference was found.
