# chessrun-stats — statistics Worker

Cloudflare Worker + D1. One script, two domains:

| Path | Access |
|---|---|
| `chessrun.app/collect/*` | public collection (`POST /visit` · `/run` · `/session`) — **same origin as the game** |
| `chessrun.app/lb/*` | leaderboard, daily challenge and profiles — public (see below) |
| `chessrun.app/s/*` | share links: an og preview for bots, a redirect for people — public |
| `1403.chessrun.app/*` | panel + `/api/*` (statistics, league, name moderation, banned words) — **behind Cloudflare Access** |

`/lb/*` endpoints:

| Method | Path | What |
|---|---|---|
| POST | `/lb/runs` | submit a finished run |
| GET | `/lb/weekly` · `/lb/pulse` · `/lb/awards` | weekly table, today's activity, badges |
| GET · POST | `/lb/daily` · `/lb/daily/start` | today's challenge: seed and leaderboard, start a run |
| POST | `/lb/hello` | once a day: name and badges of a device |
| GET · POST | `/lb/profile` | read / save a profile (moving between devices) |
| POST | `/lb/recovery` · `/lb/recovery/fetch` | set a recovery code / restore a profile with it |
| GET · HEAD | `/lb/health` | liveness check |

Both `/lb/*` and `/collect/*` are rate limited per IP with Workers rate-limiting
bindings (`wrangler.toml`). A daily cron rolls up every day that is still missing,
deletes raw rows older than 35 days and prunes the league (archives last week's top
three, drops weeks older than 8). The salt is per day: created on the first request of
the day and expired by KV after 48 hours; the cron does not touch it.

`/api/*` (panel, behind Access): `summary`, `series`, `breakdown`, `breakdowns`,
`league`, `names` and `names/act` (moderation), `words` (banned words), `health`, and
`rollup` (runs the daily rollup by hand).

Collection lives on the apex on purpose. `sendBeacon` cannot send a preflight;
cross-origin session events silently get lost on iOS. On the same origin there
is no CORS at all, and the Worker does not need any CORS code.

## Running locally

```bash
cd server
npm install
npm run migrate:local     # wrangler d1 migrations apply chessrun --local
npm run dev               # 8787
```

Then, in the project root, `cp .env.example .env.local` and `npm run dev`.
Vite's dev proxy forwards `/collect` and `/lb` to 8787, so **local is the same
origin too**, just like production. For local secrets copy `.dev.vars.example` to
`.dev.vars` (`SKIP_ACCESS`, `DAILY_SECRET`).

To see the rows:

```bash
npx wrangler d1 execute chessrun --local --json \
  --command "SELECT mode, COUNT(*) FROM run_event GROUP BY mode"
```

## Setting up a new deployment

`wrangler.toml` holds the IDs of the existing deployment. For a new one:

1. Replace `database_id` (`wrangler d1 create chessrun`), the KV `id`
   (`wrangler kv namespace create SALT`), the routes and `zone_name`, and the panel's
   custom domain.
2. Create the Access application for the panel domain and set `ACCESS_TEAM` /
   `ACCESS_AUD` (policy: Allow → Emails → the admin address).
3. `wrangler secret put DAILY_SECRET`.
4. `npm run migrate` (applies the migrations to the remote D1).
5. `cd sub && npm run build` (the panel is served from `../sub/dist`), then `npm run deploy`.

## Backup

`npm run backup` writes a full SQL dump of the production database to `server/backups/`
(not in git). `sh scripts/install-backup.sh` installs the scheduled backup on macOS; run
it again if the repository moves.

## Rules that do not change

- **An IP is never written anywhere.** It exists only as a local variable in the
  request handler, is hashed with a salt that rotates daily, and the salt is
  deleted after 48 hours.
- **The device token never reaches the statistics.** The leaderboard needs the
  token because it is a claim of identity; the statistics do not. The
  leaderboard does **not** store the raw token either: the `lb_player` key is a
  SHA-256 hash, the display form is short (`a1b2…9f`), and neither the
  responses nor the panel ever see the full token.
- **The leaderboard server cannot verify the signature** (the key stays on the
  device) — the token is a bearer secret. Defences: one row per week per
  player×mode (upsert), a whitelist clamp (`shared/leaderboard.ts` LB_LIMITS),
  a week window (yesterday/today/tomorrow), a rate limit on `/lb/*`, and
  shadowing/banning from the panel.
- **The raw User-Agent is not stored** — it is parsed into three buckets.
- **The city is not collected.** City + browser + operating system + time zone
  would single out a household and answer no product question.
- **Collection endpoints always return 204** — even when validation fails, so
  that the schema shape does not leak and the client is not pushed to retry.
- **`workers_dev = false` must stay.** Access sits in front of the route; if the
  Worker were reachable on `*.workers.dev`, Access would be bypassed and the
  whole data set would be one guessable domain away.

## Out of scope (on purpose)

Mail — never in the panel; contact and Access sign-in go through `chessrun@smartkraft.ch`.
Real-time views, data export, multiple admins, moving old `localStorage` data
(it is kept per device, so it cannot be moved to the server).
