> **EXAMPLE — ALL DATA IN THIS FILE IS FAKE.**
>
> This file is committed on purpose, to show what LifeLine's private report looks like.
> It lives in `private_test/`, not in `private/`, so it can never be mistaken for a real one.
> Every advisory, package version, service detail and weakness below is invented. The
> real sensitive report of ChessRun is `private/sensitive-report.md`; it is never in this
> repository and only goes to the customer, outside GitHub.

> **CONFIDENTIAL — DO NOT COMMIT, DO NOT PUSH, DO NOT PUBLISH.**
>
> This file lists the open weak points of ChessRun: unfixed vulnerabilities, what
> breaks when a service disappears, how backups and secrets are handled, and which
> tools run unpinned code. None of these is a leak on its own. Put together, they read
> like a map of where an attack would hurt most.
>
> Keep it out of every repository, issue tracker, chat and shared drive. Deliver it to
> the customer only: on a USB stick, by encrypted e-mail, or by hand. It is listed in
> `LifeLine_Report/.gitignore` so git skips it — check that before every commit.

# Sensitive Report — ChessRun (EXAMPLE, FAKE DATA)
Generated: 2026-10-24 · Belongs to: LifeLine_Report/dependency-report.md of the same run

## Open vulnerabilities

| Advisory | Package | Project | Scope | Found | Days open | Reaches users? | Fix |
|---|---|---|---|---|---|---|---|
| GHSA-exam-ple0-0001 — request smuggling in the HTTP parser | example-http 3.2.0 | `server` | transitive-dev (dev server) | 2026-09-12 | 42 | no — local dev server only | example-http 3.2.4 |
| GHSA-exam-ple0-0002 — prototype pollution in deep merge | example-merge 1.0.7 | `.` | transitive-runtime | 2026-10-20 | 4 | **yes** — ships in the game bundle | none yet; replace with `structuredClone` |

## Failure impact and resilience

| Service | If it disappears | Backup / recovery |
|---|---|---|
| Example Host (game) | the game does not load | redeploy from git |
| Example Database | leaderboards and profiles are lost | nightly export to a single disk in the office; restore never tested |
| Example Mail API | password-reset mails stop | none |

**Single provider.** Hosting and database share one account protected by one password
and no second factor.

## Secrets and access

- `EXAMPLE_API_KEY` grants write access to the database; it is stored in a shared note.
- `EXAMPLE_DEBUG=1` disables request signing; it is still set in one staging config.
- Admin panel: one shared login, used by three people.
- Rate limit: 1 000 requests per minute per IP (high enough to empty the free quota).

## Attack paths in the toolchain

- Production deploys run `npx example-cli@latest` — whatever is newest that day.
- A setup script runs `curl https://example.invalid/install.sh | sh`.

## What to do first

1. Replace example-merge in the game bundle (reaches users).
2. Move `EXAMPLE_API_KEY` into a secrets manager and rotate it.
3. Pin `example-cli` and drop the `curl | sh` step.
4. Test a database restore once; add a second, off-site copy.
