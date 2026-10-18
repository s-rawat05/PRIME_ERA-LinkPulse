# LinkPulse — Requirements Traceability

Sources: **PS** = official problem statement PDF (page), **PPT** = our Round 1 deck (slide).
The problem statement is authoritative for what is mandatory; the deck is our architecture blueprint.

Status: ✅ implemented and verified · 🟡 implemented, partially verified / environment-dependent · ⬜ not implemented (roadmap)

Verification legend: **T** = automated test (file › test name) · **M** = verified manually on 18 Oct 2026 against the running app (dev server and/or `next start` with real PostgreSQL 17) · **C** = code inspection.

## 1. Minimum bar (PS p4: "create a short link, be redirected through it, see basic click tracking … hosted")

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 1.1 | Create a short link | PS p4 | ✅ | T `links.test` › creates a link…; M wizard in browser |
| 1.2 | Redirect through it | PS p4 | ✅ | T `redirect.test` › redirects with 302…; M curl `302` + `no-store` |
| 1.3 | Basic click tracking | PS p4 | ✅ | T `redirect.test` (event persisted); M analytics API after real visits |
| 1.4 | Hosted / deployed link | PS p4 | ✅ | **Live at https://linkpulse-alpha.vercel.app** (Vercel, region sin1; Neon Postgres ap-southeast-1). M 18 Oct 2026: health OK, create → `302` + `no-store`, bot preview filtered, unknown code `404`, analytics updated, admin takedown → next hit `410` |

## 2. Technical guidelines (PS p5)

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 2.1 | Code generation, alias validation, rule evaluation in application logic | PS p5 | ✅ | C `lib/links/codes.ts`, `lib/redirect/engine.ts`; T `engine.test`, `links.test` |
| 2.2 | Rules drive actual redirect behaviour | PS p5 | ✅ | T `redirect.test` (paused/expired/password/cap/bot/targeting via the real handler) |
| 2.3 | Show alias and URL issues before publishing | PS p2, p5 | ✅ | T `links.test` › surfaces validation errors and warnings; M wizard shows "already taken" live and review panel |
| 2.4 | Dashboard uses live data | PS p2, p5 | ✅ | T `analytics.test` › totals equal raw event counts; M overview after real visits; 15 s live refresh |
| 2.5 | QR generation | PS p5 | ✅ | M PNG/SVG endpoints, wizard success screen, QR page |
| 2.6 | CSV import | PS p5 | ✅ | T `csv.test` (5 tests); M preview + import via API and UI |
| 2.7 | Rate limiting on link creation | PS p5 | ✅ | C `api/links/route.ts` (30/min/user); Upstash or Postgres counter (`lib/ratelimit.ts`). Rate limiter is disabled inside unit tests; DB counter path exercised in `next start` run |

## 3. Link management & creation

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 3.1 | Random short codes (7-char base36, unique + retry) | PPT s7 | ✅ | T `links.test` › generates 7-char… (5,000 unique) |
| 3.2 | Custom aliases, 3–32 chars, stored lowercase, reserved words blocked | PS p3, PPT s7 | ✅ | T `links.test` › normalises case and rejects… |
| 3.3 | Alias uniqueness enforced by DB under concurrent creation | PPT s2 (edge case 6) | ✅ | T `links.test` › simultaneous creations… exactly one succeeds (PGlite and real Postgres) |
| 3.4 | Server-side URL validation; unsafe schemes, credentials, private hosts, self-links rejected | PS p3 | ✅ | T `links.test` › destination URL validation (12 cases) |
| 3.5 | Two-step creation workflow with validation warnings | PS p2 | ✅ | M browser: step 1 destination+alias, step 2 options + live review, publish |
| 3.6 | Expiry dates (+ optional fallback URL) | PS p2–3 | ✅ | T `engine.test` › 4.*, `redirect.test` › blocks expired links… |
| 3.7 | Click caps | PS p2–3 | ✅ | T `redirect.test` › click cap boundary |
| 3.8 | Password protection (hashed) | PS p1–3 | ✅ | T `links.test` › hashes link passwords; `redirect.test` › password… |
| 3.9 | Edit, pause/resume, soft delete; code immutable | PS p3 | ✅ | T `redirect.test` (pause, edit, delete); M link detail UI |
| 3.10 | Copy link, QR preview and download | prompt | ✅ | M wizard success + link detail |
| 3.11 | Workspaces, folders, tags, campaigns | PS p1, p3 | ✅ / 🟡 | Tags, folders, campaigns ✅; workspaces are personal (one per user), team workspaces ⬜ roadmap |

## 4. Redirect engine (PPT s7 rule order)

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 4.1 | Fixed 9-step order: resolve → disabled/blocked → paused → expired → password → bot → cap → targeting → 302 | PPT s7 | ✅ | T `engine.test` (12 tests covering every step and precedence) |
| 4.2 | Unknown codes logged as `not_found` with null link | PPT s7–8 | ✅ | T `redirect.test` › logs not_found… |
| 4.3 | Wrong passwords never consume the cap | PPT s7 | ✅ | T `redirect.test` › password…; `engine.test` › wrong password never reaches the cap |
| 4.4 | Atomic cap: 50 simultaneous requests on cap 10 → exactly 10 | PPT s5, s9 | ✅ | T `redirect.test` (PGlite) and `concurrency-pg.test` on **real PostgreSQL 17 with a 20-connection pool**, including a control showing a naive check over-admits |
| 4.5 | HTTP 302 + `Cache-Control: no-store` | PPT s7 | ✅ | M curl headers; C `app/[code]/route.ts` |
| 4.6 | Bots / link previews redirected but not counted, no cap use | PPT s2, s7 | ✅ | T `redirect.test` › bots are redirected…; `auth.test` › bot classification table (14 UAs incl. HEAD/empty UA) |
| 4.7 | Device / OS / country targeting rules by priority | PS p1, PPT s7 | ✅ | T `engine.test` › 8.; `redirect.test` › targeting rules route mobile visitors; M rules editor UI |
| 4.8 | Cache with invalidation; takedown blocks the very next request | PPT s6, s9 | ✅ | T `redirect.test` › takedown: a cached link is blocked…; M curl: 3 cached hits → admin disable → next hit `410` |
| 4.9 | Safe fallback without Redis | prompt | ✅ | C `lib/cache.ts` (production default `none`, Redis errors fall back to DB); M `/api/health` in production mode reports `cache: none` |
| 4.10 | Redirect latency recorded; p95 shown | PPT s3, s9 | ✅ | T `analytics.test` › summary… (p95 non-null); M production: server-side p50 11.6 ms / p95 24.8 ms without Redis |

## 5. Click tracking & analytics

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 5.1 | Time, referrer, device, browser, OS, outcome, source, rule, latency per visit | PS p1, p3; PPT s8 | ✅ | T `redirect.test` › redirects… (asserts fields) |
| 5.2 | Location | PS p1 | ✅ | Country/city from Vercel/Cloudflare headers only (never guessed). M on production: visits recorded with country `IN`; empty in local dev |
| 5.3 | Unique visitors without storing raw IPs | PS p3, PPT s7 | ✅ | C `lib/redirect/classify.ts`; T asserts 32-hex hash |
| 5.4 | Clicks never slow the redirect | PS p1 | ✅ | C event written in `after()`; latency measured before response |
| 5.5 | Dashboard by period and campaign; top links; link alerts | PS p2–3 | ✅ | T `analytics.test`; M overview, analytics (range + campaign + custom dates), campaign pages |
| 5.6 | Expired/disabled links keep analytics | PS p2, p4 | ✅ | T `redirect.test` › blocks expired links and keeps their analytics; takedown test |
| 5.7 | Daily rollups equal raw counts | PPT s5, s8 | ✅ | T `analytics.test` › daily rollups match raw counts; M cron endpoint returned `consistent: true` |
| 5.8 | Empty datasets and date ranges | prompt | ✅ | T `analytics.test` › empty ranges return zeros |

## 6. Roles, security & governance

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 6.1 | Visitor / user / admin roles | PS p3 | ✅ | T `auth.test` › non-admins cannot…; M non-admin gets 403 on admin APIs |
| 6.2 | Users see and modify only their own resources | PS p3 | ✅ | T `links.test` › a user cannot read, edit or delete another user's link; `analytics.test` › campaign ownership; simulator 404 for foreign link |
| 6.3 | Admin pages never render for non-admins | prompt | ✅ | M curl as non-admin: zero admin content on all 5 admin pages (a layout-only guard leaked; fixed with per-page checks) |
| 6.4 | Secure password hashing and sessions | prompt | ✅ | T `auth.test` (hashing, revocation, disabled users, password change) |
| 6.5 | Admin disables abusive links | PS p3–4 | ✅ | T takedown + audit tests; M Demo B |
| 6.6 | Domain blocklist (blocks creation and existing links) | PS p3 | ✅ | T `redirect.test` › blocklisting a domain blocks existing cached links; `csv.test` |
| 6.7 | Audit log (secrets redacted) | PPT s3, s8 | ✅ | T `auth.test` › admin takedowns are audited…; › audit entries never contain password hashes |
| 6.8 | Rate limits on creation, password attempts, login, sign-up, import | PPT s4 | ✅ | C `lib/ratelimit.ts` + call sites |
| 6.9 | CSRF protection on mutations | prompt | ✅ | M cross-site POST → `403` in production mode |
| 6.10 | External URL safety service | PPT s4 | 🟡 | Google Safe Browsing integrated; runs only when `GOOGLE_SAFE_BROWSING_API_KEY` is set, otherwise links are stored and shown as `not_scanned` (never claimed as scanned). Not exercised with a real key |
| 6.11 | Safe admin initialisation | prompt | ✅ | `npm run admin:create` (random password printed once or `ADMIN_PASSWORD`) — M used locally |
| 6.12 | Basic abuse monitoring | PS p1 | ✅ | C `abuseAlerts()` (password brute force, traffic spikes, repeated hits on disabled links); admin dashboard |

## 7. Campaigns, tags, QR, CSV

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 7.1 | Campaigns show total links, clicks, top performers | PS p3 | ✅ | T `analytics.test` › campaign metrics come from real events |
| 7.2 | Tags + filter by tag | PS p3 | ✅ | M link list filters; C `listLinks` |
| 7.3 | QR PNG/SVG + scan tracking | PS p3, PPT s3 | ✅ | T `redirect.test` › tracks QR-originated visits; M downloads |
| 7.4 | CSV row-level errors, duplicates, blocked domains; only valid rows imported | PS p3, PPT s5 | ✅ | T `csv.test` (incl. the 50-row demo file: 35 valid / 14 rejected / 1 skipped) |

## 8. Beyond the brief (PPT s3)

| # | Requirement | Source | Status | Verification |
|---|---|---|---|---|
| 8.1 | Rule simulator using the same engine, not recorded | PPT s3 | ✅ | T `analytics.test` › simulator uses the engine but never writes events; M simulator UI |
| 8.2 | Outcome tracking for every visit | PPT s3 | ✅ | T `redirect.test` |
| 8.3 | Measured redirect speed (p95) | PPT s3 | ✅ | see 4.10 |
| 8.4 | Seed data: 3 campaigns, ~30 links in every state, 30 days of clicks, labelled synthetic | PPT s5 | ✅ | M `npm run db:seed` → 30 links, 3 campaigns, 5 tags, 10,106 events, all `is_synthetic` and labelled in the UI |
| 8.5 | k6 load test with measured p95 | PPT s5 | 🟡 | Script provided (`loadtest/redirect.js`); not run here (k6 not installed) |
| 8.6 | CI runs rule-order and concurrency tests on every push | PPT s4 | 🟡 | `.github/workflows/ci.yml` written; will run once the repository is pushed to GitHub |

## 9. Roadmap (explicitly optional in PS p4 / PPT s9)

| Item | Status |
|---|---|
| Custom domains with DNS verification | ⬜ |
| Public REST API + API keys | ⬜ |
| A/B split targeting | ⬜ (device/OS/country targeting ✅) |
| Team workspaces with roles | ⬜ |
| Link-in-bio pages (PS p1 lists them) | ⬜ |
| Click-spike alerts / periodic Safe Browsing re-scans | 🟡 basic 24 h spike signal on admin dashboard; re-scans ⬜ |
