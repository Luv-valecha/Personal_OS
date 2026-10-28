# Troubleshooting (V4)

**Settings shows "Database update needed", or a V4 setting/feature won't save** — a migration hasn't been applied to *this* app's database. Run `npm run db:migrate` with that database's `DATABASE_URL` (production = the Neon URL in Vercel). Glass, bugs, checklists, memory, scheduled dates and custom recurrence each need their migration (006–010).

**Glass widgets reset after refresh** — see above (migration `009`). Until it is applied the choice is saved on this device only (a toast tells you).

**JARVIS says AI is off** — no `GEMINI_API_KEY`. Rule-based commands still work ("add task: …", "show me today's tasks", "what's my budget?", "remember that …").

**JARVIS answers look stale / identical** — they may come from the Redis cache (≤ 5–10 min, and any write you make invalidates them). Check `/api/cache/status` (signed in); set `CACHE_DISABLED=1` to turn all caching off, or `DASHBOARD_CACHE=0` for the dashboard only. See `REDIS_SETUP.md`.

**Redis: `breaker.open: true`** — Redis failed or the free quota (500K commands/month) was hit; the app is using the database and retries automatically (30 s, doubling to 5 min). Check Upstash → Usage and your env vars.

**Microphone: browser never asks for permission** — fixed in 4.0.1 (the site's own `Permissions-Policy` header used to forbid the mic). After deploying, reload once so the new service worker/headers apply. If you ever chose *Block* for the site, Chrome won't ask again: click the lock/tune icon next to the address → Site settings → Microphone → Allow. If the message says the page "isn't allowed to use the microphone (a server setting)", check that `next.config.js` still has `microphone=(self)`.

**Microphone button says unsupported / blocked** — Firefox has no speech recognition; elsewhere allow the microphone for the site (browser address-bar icon → site settings). Voice input needs an internet connection. "I didn't hear anything": speak after the "Listening…" prompt. Spoken replies silent: turn them on with the speaker button, check the device volume and installed voices; some browsers need one tap on the speaker first.

**Mini music player is in the way** — tap its ✕ (it pauses and hides the bar but keeps your queue; playing anything again brings it back). *Clear queue* on the Music page empties the queue.

**Music widget: "None of these songs are on this device"** — audio files live on each device. Open the Music page and add/locate the files on this device.

**Deleting a project removed more than before** — intended in V4: its tasks, ideas, notes, deadlines, files, bugs and linked checklists go with it (the dialog lists counts). Restore from your backup if it was a mistake.

**A repeating event is missing in some months** — monthly on day 29–31 skips shorter months; choose "Last day of the month" or an earlier day.

**Old UI after deploy** — the service worker version changed to 4.0.0; reload once (or close/reopen the installed app) so the new worker takes over.

**`npm run lint` fails** — `next lint` was removed in Next 16; there is no lint step in this project.

**Neon is slow on the first request** — free-tier compute suspends when idle and takes a moment to wake.
