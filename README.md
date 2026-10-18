# LinkPulse — URL Shortener & Analytics Platform

**Every link. Smarter insights.** LinkPulse manages the full link lifecycle:
**create → validate → share (URL / QR) → redirect → track → analyse → expire or take down.**

Built by **Team PRIME ERA** (GEHU Bhimtal) for Round 2 of the LinkPulse hackathon.

**Live:** https://linkpulse-alpha.vercel.app (Vercel `sin1` + Neon Postgres Singapore). Demo and admin credentials are kept
out of the repository in the git-ignored `.secrets/` folder of the deploying machine.
Requirement-by-requirement status lives in [REQUIREMENTS.md](REQUIREMENTS.md).

---

## What works today

| Area | Implemented |
|---|---|
| Links | Random 7-char base36 codes, custom aliases (3–32 chars, case-insensitive, reserved words blocked), title, campaign, folder, tags, expiry (+ optional fallback URL), click cap, password (bcrypt), pause/resume, soft delete |
| Creation wizard | Two steps: destination + alias (live availability), then options with a live server-side review of blocking errors and warnings before publishing |
| Redirect engine | Pure `evaluate()` with a fixed 9-step rule order, atomic click cap, bot/preview detection, device/OS/country targeting rules, `302` + `Cache-Control: no-store` |
| Tracking | Every visit stored with its outcome (`redirected`, `not_found`, `disabled`, `paused`, `expired`, `password_failed`, `limit_reached`, `bot`), referrer domain, device, OS, browser, country/city (platform headers only), link-vs-QR source, matched rule, server latency, privacy-preserving visitor hash |
| Analytics | KPIs, daily trend, referrers, devices, browsers, OS, countries, outcomes, top links, campaign performance, QR share, p50/p95 redirect latency, date ranges, demo-data toggle, 15-second live refresh |
| Campaigns & tags | CRUD, UTM metadata, per-campaign metrics and top link, tag filtering, folders |
| QR codes | PNG (1024px) and SVG download, custom colours, `?s=qr` scan attribution |
| Bulk import | CSV preview (nothing written) → import of valid rows only, row-level errors, import history |
| Governance | Admin dashboard, platform-wide analytics, link takedown/restore with immediate cache invalidation, domain blocklist (subdomains included), user roles/disable, audit log, basic abuse signals |
| Rule simulator | Same engine as live redirects; what-if overrides for status, time and click count; never writes analytics |
| Security | DB-backed revocable sessions (HttpOnly, SameSite=Lax), server-side role + ownership checks everywhere, Origin check on mutations, Zod validation, rate limits (link creation, password attempts, login, sign-up, import), SSRF/open-redirect-safe URL validation, security headers, secrets redacted from audit log |

## Architecture

```
HOT PATH     visitor ─► /[code] route ─► cache (Upstash) ─► Postgres on miss ─► evaluate() ─► 302 no-store
                                                     │ capped link: UPDATE … WHERE click_count < max_clicks
COLD PATH    after(response): insert click_event (+ counter for uncapped links) ─► daily rollup cron
CONTROL      dashboard / admin ─► Route Handlers (session + role + ownership + Zod + rate limit) ─► Postgres
             every mutation deletes the link's cache entry in the same request
```

**Rule order** (`src/lib/redirect/engine.ts`): 1 resolve code → 2 admin-disabled / blocked domain → 3 paused →
4 expired → 5 password → 6 bot / link preview → 7 click cap (atomic) → 8 targeting → 9 `302`.
Expiry runs before the password (nobody is asked for a password on a dead link); the password runs before the
cap (wrong passwords never use clicks); bots are redirected but never counted and never consume the cap.

**Race-safe cap** (`src/lib/redirect/resolve.ts`):
```sql
UPDATE links SET click_count = click_count + 1
WHERE id = $1 AND max_clicks IS NOT NULL AND click_count < max_clicks AND status = 'active' AND deleted_at IS NULL
RETURNING click_count;   -- 0 rows = limit_reached
```

**Data model** (`src/db/schema.ts`, migration `drizzle/0000_init.sql`): `users`, `sessions`, `workspaces`, `folders`,
`campaigns`, `tags`, `links`, `link_tags`, `redirect_rules`, `qr_codes`, `click_events` (append-only, nullable
`link_id` so unknown codes are still logged), `link_stats_daily`, `blocked_domains`, `audit_log`, `import_jobs`,
`import_rows`, `rate_limits`. Uniqueness, lowercase codes, positive caps and non-negative counters are enforced by
database constraints.

**Privacy**: raw IP addresses are never stored. Unique visitors = `SHA-256(HMAC(AUTH_SECRET, UTC date) | link | IP | UA)`,
so hashes cannot be linked across days ("daily uniques"). Rate-limit keys use an HMAC of the IP.

### Stack and deliberate deviations from the Round 1 deck

Next.js 16 (App Router, Route Handlers) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Lucide · Motion (the
current name of Framer Motion) · Zod · Drizzle ORM · PostgreSQL (Neon) · Upstash Redis + Ratelimit · isbot ·
ua-parser-js · qrcode · PapaParse · bcryptjs · Vitest · k6.

| Deck said | We built | Why |
|---|---|---|
| Auth.js | Small first-party auth: bcrypt + random session tokens stored hashed in Postgres | Credentials-only login with instantly revocable sessions (disabling a user signs them out everywhere); fewer moving parts |
| Redis click queue drained by cron | Click event inserted in `after()` (Vercel `waitUntil`) | One fewer place an event can be lost; redirect latency is still unaffected. A queue is on the roadmap for very high volume |
| ua-parser-js | ua-parser-js **1.x** | 2.x is AGPL-3.0; 1.x is MIT |
| — | PGlite (Postgres compiled to WASM) for local dev/tests | Zero-install local setup with identical SQL and migrations |

## Run locally

Requirements: Node.js 20.9+ (tested on 22), npm. No database install needed.

```bash
npm install
cp .env.example .env.local          # defaults work locally (embedded PGlite database in ./.data)
npm run db:seed                     # optional synthetic demo data; prints the demo user's password once
npm run admin:create -- --email you@example.com   # creates/promotes an admin; prints a random password once
npm run dev                         # http://localhost:3000
```

Notes
- The embedded PGlite database is single-process: stop `npm run dev` before running `db:seed` or `admin:create`.
- To use a real Postgres locally, set `DATABASE_URL=postgresql://…` and run `npm run db:migrate`.
- Delete `./.data` to start from an empty database.

## Tests and checks

```bash
npm run lint
npm run typecheck
npm test                 # 88 tests (+2 real-Postgres tests that skip without TEST_DATABASE_URL)
npm run build
```

Real PostgreSQL concurrency (separate pooled connections that genuinely contend):

```bash
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/linkpulse_test DATABASE_POOL_MAX=20 \
  npx vitest run tests/engine.test.ts tests/redirect.test.ts tests/links.test.ts tests/concurrency-pg.test.ts
```

`tests/concurrency-pg.test.ts` first shows that a naive read-then-write cap check **over-admits** under the
same 50-request load (proving the requests overlap), then that LinkPulse admits **exactly 10 of 50** on a cap-10
link. GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, all tests, the PostgreSQL 17 suite and the
production build on every push.

Load test (requires [k6](https://k6.io)): `BASE_URL=https://your-app CODE=some-alias k6 run loadtest/redirect.js`.

## Deploy (Vercel + Neon + optional Upstash)

1. **Neon**: create a project and copy the **pooled** connection string (`…-pooler…?sslmode=require`).
2. **Migrate** from your machine: `DATABASE_URL="<neon url>" npm run db:migrate`.
3. **Admin**: `DATABASE_URL="<neon url>" npm run admin:create -- --email you@example.com` (password printed once).
4. *(Optional demo data)*: `DATABASE_URL="<neon url>" npm run db:seed`.
5. **Vercel**: import the GitHub repository (framework: Next.js). Set environment variables:
   - `DATABASE_URL` (Neon pooled URL), `AUTH_SECRET` (64 hex chars), `CRON_SECRET`
   - `NEXT_PUBLIC_BASE_URL` = your production origin, e.g. `https://linkpulse.vercel.app`
   - optional `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (Upstash → Redis → REST API)
   - optional `GOOGLE_SAFE_BROWSING_API_KEY`
6. Deploy (`vercel deploy --prod`). `vercel.json` pins functions to `sin1` (next to the Neon Singapore database) and
   schedules the daily rollup cron (`/api/cron/rollup`, authenticated with `CRON_SECRET`). If `NEXT_PUBLIC_BASE_URL` is
   unset, short links use the project's production domain (`VERCEL_PROJECT_PRODUCTION_URL`).
   Alternative used for the live site: `vercel integration add neon -m region=sin1` provisions Neon and injects
   `DATABASE_URL` / `DATABASE_URL_UNPOOLED` automatically (run migrations over the unpooled URL).
7. Verify: `GET /api/health` should report `"database":"ok","databaseDriver":"postgres"` and the cache driver.

Without Upstash, redirects read Postgres directly (cache driver `none`) and rate limits use Postgres. This is
correct but slower; a per-instance memory cache is deliberately **not** used in production because it could keep
serving a link after an admin takedown on another instance.

## Demo script (≈5 minutes)

Prepare: deploy, create an admin, optionally seed. Have a phone ready for the QR scan.

**Demo A — creation to analytics**
1. Sign in → **Campaigns** → *New campaign* → `Diwali Sale`.
2. *Add link* → paste a destination, try alias `winter-offers` (shows *already taken* if seeded) then `diwali-sale` → *Continue*.
3. Add a tag and click limit; the **Validation review** shows warnings (e.g. Safe Browsing not configured) → *Publish*.
4. Scan the QR with a phone, open the link on a laptop, and paste it into WhatsApp (link preview).
5. Open the link's analytics: 2 human clicks (mobile via QR, desktop), WhatsApp preview counted as **bot** and excluded, cap usage, p95 latency, recent visits table.

**Demo B — bulk import to takedown**
1. **Bulk Import** → drop [`demo/scenario-b.csv`](demo/scenario-b.csv) (50 rows) → the report flags 14 bad rows
   (missing scheme, `javascript:`, blocked domain + subdomain, duplicate alias in file, taken alias, reserved aliases,
   past expiry, bad click limit, unknown campaign, private address, too-short alias, blank row skipped).
2. *Import 35 valid rows* → only valid rows become links.
3. Visit one imported link (e.g. `/dw-festive-kurtas`) a few times → redirects (now cached).
4. As admin: **All links** → *Disable* with reason "Phishing report" → open the link again → **"Link unavailable" (HTTP 410)** on the very next request.
5. Its analytics still show the earlier clicks plus the blocked visit.

## Project layout

```
src/app/[code]/route.ts        redirect endpoint (GET/HEAD; POST = password form)
src/app/api/**                 Route Handlers (auth, links, campaigns, tags, folders, import, simulate, analytics, admin, cron, health)
src/app/dashboard/**           dashboard + admin UI
src/lib/redirect/              engine (pure rules), resolve (cache + atomic cap + event), classify (bots/UA/geo/hash), simulate
src/lib/links/                 codes/aliases, URL validation, blocklist + Safe Browsing, link service
src/lib/analytics/             aggregation queries, daily rollups
src/lib/csv/                   CSV validation and import
src/db/                        Drizzle schema + driver selection;  drizzle/  SQL migrations
scripts/                       migrate, seed, create-admin;  tests/  Vitest suites;  loadtest/  k6
```

## Known limitations

- Country/city are recorded only when the host supplies geo headers (Vercel/Cloudflare); locally they are empty.
- The live site runs without Upstash Redis, so each redirect reads Neon (server-side p95 ≈ 25 ms measured). Adding
  Upstash enables the shared link cache.
- Click events are written in `after()`. On Vercel this is backed by `waitUntil`; on other hosts a crash between the
  response and the insert could lose that one event (the redirect itself and cap enforcement are unaffected).
- Dashboards query raw events (indexed) for exact totals; `link_stats_daily` rollups exist and are verified against
  raw counts but are not yet used to serve very large date ranges.
- Workspaces are personal (one per user); team roles, custom domains, a public API and link-in-bio pages are roadmap.
- The k6 script is provided but was not executed in this environment (k6 not installed).

## Roadmap

Custom domains with DNS verification · public REST API + API keys · A/B split targeting · team workspaces
(owner/editor/viewer) · link-in-bio pages · click-spike alerts and periodic Safe Browsing re-scans.
