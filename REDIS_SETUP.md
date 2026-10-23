# Redis cache (V4) — setup, behaviour and limits

**What it does:** (1) repeated *read-only* JARVIS questions that need the AI ("what's my average coffee spend?") are answered from cache instead of calling Gemini again; (2) the **dashboard's data** (tasks, deadlines, events, money, focus, notes, …) is cached per user so the page doesn't re-run its ~10 queries on every load. Redis is **only a cache** — Neon stays the source of truth, and everything works with Redis absent.

## Provider: Upstash Redis (free tier)
Chosen because it is HTTP/REST-based (no connection pooling problems on Vercel serverless), has a free tier that needs no card, and needs no extra npm dependency (the app speaks the REST protocol directly with `fetch`).

Limits checked against Upstash's official pricing/billing docs (Oct 2026 — **re-check before relying on them**: <https://upstash.com/pricing/redis>, <https://upstash.com/docs/redis/overall/billing>):
* Free: **256 MB**, **500,000 commands / month**, 10,000 commands/sec, **one free database per account**.
* Every `GET`/`SET`/`DEL` is one command. One cache **lookup = 2 commands** (version + entry, sent as a single pipelined request), a **store = 1**, an **invalidation (any write) = 1**.
* Rough budget: 500K/month ≈ 16K/day. A personal dashboard using JARVIS a few hundred times a day stays far below this. Only AI-path questions touch Redis; rule-based commands (`add task…`, `today's tasks`) never do.
* When the quota is exhausted Upstash answers HTTP 429; the app then **stops calling Redis for a while (circuit breaker) and uses the database/AI as normal**.

## Setup
1. Create an account at <https://console.upstash.com> → **Create database** (Redis). Pick the region closest to your Vercel functions' region (latency matters more than anything else here). Free plan.
2. Open the database → **REST API** section → copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN** (use the *read/write* token).
3. **Local:** put both in `.env.local` (see `.env.example`), restart `npm run dev`. (Without them, development uses a small in-process memory cache so you can see it work; production without them = cache off.)
4. **Vercel:** Project → Settings → Environment Variables → add both for *Production* (and Preview if wanted) → redeploy.
5. **Verify:** sign in, ask JARVIS the same AI question twice (e.g. a question that isn't a plain command), then open `/api/cache/status` (signed in): `mode: "upstash"`, `hits` ≥ 1. Add `?probe=1` for a live round-trip check (uses 3 commands).
6. **Confirm the fallback:** set `CACHE_DISABLED=1` (or remove the variables) and redeploy → JARVIS works exactly as before, `mode: "off"`.

## Safety design
* **User isolation:** every key contains the signed-in user's id taken from the session (`lo4:u:{userId}:…`); the id is never read from a request. Query text is hashed in the key.
* **Invalidation:** every successful write bumps a per-user version token (server actions via `safe()`, JARVIS tools via the orchestrator, file uploads). A cached entry is valid only while its version is unchanged. The version is captured *before* the work starts, so a write that lands mid-request makes that result instantly stale.
* **What is cached:** only AI-path answers whose tools are all on a **read-only allow-list** (`lib/jarvis/cachepolicy.js`, checked in tests against the real tool registry), single-turn, not command-shaped. Never cached: errors, clarifications, confirmations, UI actions (theme change, focus timer), anything involving a write tool. New tools default to *invalidate*, never to *cacheable*.
* **TTLs (always bounded):** 300 s for data-grounded answers, 60 s for time-relative ones (events, priorities, deadlines, focus), 600 s for plain conversational answers. The date and timezone are part of the key, so "today's…" never survives midnight.
* **Not cached:** credentials, sessions, API keys, uploaded files, music, other pages' data. (Dashboard data **is** cached — see below.)
* **What Redis does hold:** JARVIS reply text and cards (which can include task titles, amounts, project names). They are stored at rest at Upstash and sent over TLS. If that is not acceptable for some data, set `CACHE_DISABLED=1`.
* **Failure handling:** 2 consecutive failures (or any HTTP 429) open a circuit breaker (30 s, doubling to 5 min) during which Redis is not called at all; timeouts default to 800 ms. A write is **never** reported as failed because cache invalidation failed; if an invalidation can't be delivered, that user's cached reads are bypassed on this instance until it is, and staleness elsewhere is bounded by the TTL (≤ 10 min worst case).

## Operations
* **Rotate credentials:** Upstash console → database → reset/rotate the REST token → update the Vercel env var → redeploy. Old token stops working immediately; the app just falls back to the database until redeployed.
* **Disable temporarily:** `CACHE_DISABLED=1` + redeploy.
* **Monitor quota:** Upstash console → database → *Usage* (email alerts are sent when limits are exceeded). In-app: `/api/cache/status` shows hits/misses/errors/breaker per server instance.
* **Measure it yourself:** `npm run cache:bench` prints p50/p95 for a Neon query and a Redis lookup from *your* machine/network. Numbers from a different network than your Vercel region only indicate the order of magnitude.

## Known limits
* Counters in `/api/cache/status` are per serverless instance and reset on cold start.
* The first ask after any write is a miss by design (any write invalidates all of that user's cached answers — simple and safe, at the cost of hit rate).
* Dashboard caching (below) was verified for correctness, but its **speed benefit was not measured on a real Neon + Upstash pair** — see "Dashboard cache: what to expect".
* Not verified here: a real Upstash database (no network/credentials in the sandbox). The REST client is tested against a protocol-compatible mock; the protocol was checked against Upstash's official docs. Do the 6-step verification above after deploying.

## Dashboard cache
* **Key:** per user + today's date + timezone + *which widgets are visible* (so hidden widgets never load or leak, and changing the layout never shows the wrong set). TTL **60 s** as a safety net; real freshness comes from the version token — every write (task edit, expense, JARVIS action, file upload, settings…) invalidates it, so the next load is fresh.
* **Cost:** a hit = 2 commands (one pipelined request); a miss = 3 (2 + the store); every write adds 1 (invalidation). Worst case (every load a miss) 300 dashboard loads/day ≈ 27K commands/month — about 5% of the free 500K.
* **Same data either way:** the payload is normalised to plain JSON on hit *and* miss (dates become ISO strings), so a cached page and a fresh page render identically. (This also fixes an old quirk where the "newest first" task sort compared `Date` objects as text.)
* **Contains personal data:** the cached payload includes task/deadline/note titles, a snippet of pinned notes, and money totals; it sits at Upstash with a 60 s TTL. Set `CACHE_DISABLED=1` to turn all caching off, or `DASHBOARD_CACHE=0` to turn off only this part.
* **What it does NOT skip:** the page still checks your session user and loads your settings from the database on every load (that's deliberate: a deleted user or changed layout must take effect immediately).

### Dashboard cache: what to expect (honest)
The dashboard's queries already run **in parallel**, so a cache *miss* costs roughly one database round trip plus the slowest query, and a *hit* costs one Redis round trip. The saving is therefore the difference between those two — **largest** when (a) Neon is slow/cold (free-tier compute that has been idle takes noticeably longer to answer), (b) your region to Neon is far, or (c) one widget's query is heavy; **small** when Neon and Redis are both close and warm. In the development sandbox (local Postgres, sub-millisecond) a hit was *not* faster, which proves nothing about Vercel + Neon.
**Measure it on your setup:** `npm run cache:bench` times the real `getDashboard()` for your first user vs one Redis lookup and tells you whether caching helps from your network. Pick the Upstash region **closest to your Vercel functions**, and if the numbers show no gain, set `DASHBOARD_CACHE=0` (keep JARVIS caching).
