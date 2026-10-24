# Dependency Report — ChessRun
Generated: 2026-10-24 (run 2026-10-24-2) · Scope: full
Ecosystems: npm (3 projects: `.`, `server/`, `sub/`) · Previous report: 2026-10-24 · Baseline: [2026-10-24](baseline-2026-10-24.md)

## Summary

- **The only outside code at runtime is React.** What the game (`.`) and the panel (`sub/`)
  send to the browser from outside is `react`, `react-dom` 19.3.1 and their dependency
  `scheduler` — 3 packages. Everything else is a development or build tool.
- **The dependencies that hold the project hostage:** `react`/`react-dom` (the base of both
  interfaces), `vite` + `typescript` (the build), `wrangler` (the whole server toolchain) and
  Cloudflare (hosting, database, authentication).
- **In this run:** with ChessRun 1.1.1 every package was updated within its range, and
  **21 known vulnerabilities were closed** (listed below with the dates they were found and
  closed). The self-hosted fonts now ship with their license texts and are recorded in
  `VENDORED.md`.
- **No** direct dependency is unmaintained, deprecated, archived or runs an install script.
  **No** micro-package has a built-in replacement.

## Context Map

**Ecosystems**

| Project | Manifest | Lock | Runtime | What |
|---|---|---|---|---|
| game | `package.json` | `package-lock.json` (v3) | 3 packages | React + Vite, chessrun.app (Cloudflare Pages) |
| server | `server/package.json` | `server/package-lock.json` (v3) | 0 | Cloudflare Worker `chessrun-stats` |
| panel | `sub/package.json` | `sub/package-lock.json` (v3) | 3 packages | React + Vite, 1403.chessrun.app (Worker assets) |

CI workflows, Dockerfile, devcontainer: **none**. Deploys are done by hand.

**Modules**

- `src/` — game interface and engine (`engine/`, `ui/`, `components/`)
- `shared/` — code shared by the game, the panel and the server, imported through the
  `@shared/*` alias (`tsconfig.app.json`, `vite.config.ts`) — **not an outside package**
- `server/src/` — the Worker: collection, leaderboards, sharing, panel API, cron
- `sub/src/` — the admin panel
- `scripts/browser-check.cjs` — browser check run by hand (not part of CI)

**Module → outside package map** (import count)

| Module | Outside packages |
|---|---|
| `src/` | `react` (26), `vitest` (21, tests), `react-dom` (2) |
| `shared/` | — |
| `server/src/` | `vitest` (3, tests); no outside package at runtime, only the Workers runtime |
| `server/scripts/` | Node built-ins only (`node:fs`, `node:path`, `node:os`, `node:child_process`) |
| `sub/src/` | `react` (7), `react-dom` (1) |
| `scripts/` | `playwright-core` (1) — installed separately, at the fixed version (1.64.1) written at the top of the script |
| root config | `vite`, `@vitejs/plugin-react`, `vitest` |

## External Code Inventory

**Packages** (direct; version = installed)

| Package | Version | Projects | Direct? | Used? | License | Last release | Risk signals | Criticality |
|---|---|---|---|---|---|---|---|---|
| react | 19.3.1 | game, panel | direct (runtime) | yes (33 files) | MIT | 2026-10 (19.3.1) | — | HIGH |
| react-dom | 19.3.1 | game, panel | direct (runtime) | yes (entry point) | MIT | 2026-10 (19.3.1) | — | HIGH |
| vite | 8.3.5 | game, panel | dev | yes (build) | MIT | 2026-10 (8.3.5) | — | HIGH |
| typescript | 6.0.3 | all | dev | yes (build, `tsc -b`) | Apache-2.0 | 2026-07 (7.0.2) | `~6.0` — major version 7 left out | HIGH |
| wrangler | 4.152.0 | server | dev | yes (dev, deploy, migrate, types, backup) | Apache-2.0 OR MIT | 2026-10 (4.152.0) | — | HIGH |
| vitest | 4.1.12 | all | dev | yes (game, server); no test files in the panel | MIT | 2026-10 (5.0.5) | — | MED |
| @vitejs/plugin-react | 6.1.2 | game, panel | dev | yes (vite config) | MIT | 2026-10 (6.1.2) | — | MED |
| oxlint | 1.89.0 | all | dev | yes (lint) | MIT | 2026-10 (1.89.0) | — | LOW |
| @types/node, @types/react, @types/react-dom | 24.19.2 / 19.3.0 / 19.3.0 | game, panel | dev | yes (types) | MIT | 2026-09/10 | — | LOW |

Transitive runtime dependency: `scheduler` 0.28.0 (React's), MIT, healthy.

**Toolchain**

| Tool | Where |
|---|---|
| wrangler | Pages deploy (game), Worker deploy, D1 migrations and backup — all with the locked version in `server/` |
| playwright-core 1.64.1 | `scripts/browser-check.cjs` (browser check run by hand) |
| Node.js | local; no `engines` field |

**Assets**

| File | What | Source | License |
|---|---|---|---|
| `public/fonts/press-start-2p-latin*.woff2` (2) | Press Start 2P font | Google Fonts | SIL OFL 1.1 — text: `public/fonts/OFL-PressStart2P.txt` |
| `public/fonts/vt323-latin*.woff2` (2) | VT323 font | Google Fonts | SIL OFL 1.1 — text: `public/fonts/OFL-VT323.txt` |

**No** script, style or font is loaded from a CDN — everything is served from the project's
own domain.

**Findings**

- 🟡 **The panel declares `vitest` and has an `npm test` script, but there are no test files
  under `sub/`.** `vitest run` fails when it finds no tests; the root `npm run check` does not
  run the panel tests.
- ⚪ `oxlint` 1.89 brought new React rules: lint warnings went from 1 to 22 (all warnings,
  no errors; `npm run check` passes).
- ⚪ `typescript` 7 and `vitest` 5 are out; the current ranges do not take them (on purpose).
- ⚪ The "single maintainer" accounts on npm (`@types/*`, `oxlint`, `wrangler`) are
  organisation accounts (DefinitelyTyped, Oxc, Cloudflare), not a real one-person risk.
- ⚪ React is now published to npm from CI (GitHub Actions, trusted publishing).
- ⚪ Packages that run an install script exist only in the development tree: `fsevents`
  (3 projects), `esbuild` and `workerd` (server). All three are common, expected binary
  downloaders.

## External Services

| Service | Referenced in | Credential |
|---|---|---|
| Cloudflare Pages (`chessrun` project) | manual deploy, `public/_headers`, `_redirects` | Cloudflare account |
| Cloudflare Workers (`chessrun-stats`) | `server/wrangler.toml`: `/collect/*`, `/lb/*`, `/s/*`, `1403.chessrun.app` | Cloudflare account |
| Cloudflare D1 (`chessrun`) | `env.DB` | binding |
| Cloudflare KV (`SALT`) | `env.SALT` | binding |
| Cloudflare Rate Limiting | `env.LB_LIMIT`, `env.COLLECT_LIMIT` | binding |
| Cloudflare Access | `server/src/access.ts` | yes |
| Worker secret | `env.DAILY_SECRET` | yes |
| Cron (`5 0 * * *`) | `wrangler.toml` | — |
| Share targets: x.com, facebook.com, t.me, wa.me | `src/ui/share.ts` | no (outgoing links only) |
| remaker.ch, smartkraft.ch, github.com | `Home.tsx`, `about.html` | no (links only) |

## Recommendations

All of these are recommendations; acting on them is the project owner's decision.

| Topic | Verdict | Why | Cost |
|---|---|---|---|
| Panel `vitest` | **decide** — keep it if panel tests are coming (with `--passWithNoTests` if needed), remove it if not | a dead dependency or a broken `npm test` | very low |
| New lint warnings | **review** — look through the 22 React warnings once | some may point to a real re-render problem | low |

**Vendoring:** no candidates. The only outside code at runtime is React; it is a framework
and is not copied in. No package listed in `replacements.md` (built-in replacements) is used.

The **font** recommendation from the baseline was carried out (OFL texts + `VENDORED.md`).

## Vendor Tracking

| Entry | Recorded | Latest upstream | Status | Local |
|---|---|---|---|---|
| retro-fonts (Press Start 2P, VT323) | Google Fonts subsets, 2026-08-23 | — | unchecked — Google Fonts has no machine-readable version; compared by hand once a year | unchanged (checksum matches) |

## Closed vulnerabilities

Responsible disclosure: these were found by LifeLine and are fixed now. 21 advisories,
found 2026-10-24 and closed 2026-10-24 by the ChessRun 1.1.1 dependency update.

| Advisory | Package | Project | Found | Closed | Days open |
|---|---|---|---|---|---|
| GHSA-587h-7wmj-h5pm | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-698v-4r3x-3vcv | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-9jrq-w75r-8gcw | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-r825-w8mm-5pxw | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rq7h-c2jc-7f22 | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-vfpm-58rq-9qcg | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-82fw-gwwq-j7x9 | vitest, @vitest/mocker | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-qxg6-89mg-rqv8 | @vitest/mocker | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-68fv-2mgg-jv7q | source-map-js | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rgj7-g3m4-5g8c | sharp | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-wq5f-xc86-pv6w | sharp | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-2gqq-gqf2-x968 | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-2jfj-6hjv-fm6j | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-3wwx-pv8p-q78v | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-3xpg-4rpp-hhhm | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-8436-99hf-9mmv | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-pmjh-fq2x-6v4x | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-r53p-7pc4-xj5r | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rfgv-xxqx-mfg5 | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rx4f-c7p8-82vq | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-w293-vg96-wgc3 | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |

All of them were in development tools (dev server, test runner, local Worker runtime);
none was part of what chessrun.app or the panel serve to users.

## Changes since last report

- 21 known vulnerabilities closed (above).
- Direct dependencies updated within their ranges: react/react-dom 19.2.8 → 19.3.1,
  vite 8.2.1 → 8.3.5, vitest 4.1.10 → 4.1.12, wrangler 4.123.0 → 4.152.0, oxlint 1.78.0 → 1.89.0,
  @vitejs/plugin-react 6.0.5 → 6.1.2 and the type packages; plus 222 transitive development packages.
- New: a `VENDORED.md` entry (`retro-fonts`) and the OFL license texts.
- No high-severity (🔴) change: no maintainer handover, no new install script, no license change.
- Details: [changes/2026-10-24-2-changes.md](changes/2026-10-24-2-changes.md) · long view: [timeline.md](timeline.md)

## Limits of This Analysis

- Dynamic imports (`import()` with a variable, `require` with a computed path) were not traced.
- Installed versions were read with `npm ls` and the transitive tree from the lock files;
  npm's own tool was available, nothing was guessed.
- Known vulnerabilities were checked with `npm audit` and OSV.
- The font licenses were taken from the OFL texts in the Google Fonts repository; the
  `woff2` metadata could not be read without `fontTools`.
- The "maintainers" field of `upstream-health.sh` counts npm accounts; it does not show how
  many people stand behind an organisation account.
- Both runs were made on the same day (before and after closing the vulnerabilities), so the
  steps in the timeline are hours apart, not months.
- `nogit/`, `dist/` and `node_modules/` were not scanned.

## Sensitive report

A sensitive report was produced in this run. It is not part of this repository and is
delivered to the customer outside GitHub.

Generated: 2026-10-24 (run 2026-10-24-2) · sha256: c70e62457faa94867671bb554a33e295e284ef6bd553d5c1800d0f50a94cbd5e
