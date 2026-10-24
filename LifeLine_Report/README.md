# LifeLine_Report

Written by [LifeLine](https://github.com/reporemaker/LifeLine), a Claude Code skill that
tracks everything this project depends on from the outside. This folder is a real
example of its output.

| File | What it is |
|---|---|
| [dependency-report.md](dependency-report.md) | latest full report, including the vulnerabilities that were found and closed |
| [baseline-2026-10-24.md](baseline-2026-10-24.md) | the first report, kept as the reference point |
| [changes/](changes/) | one short report per run: only what changed and what needs attention |
| [timeline.md](timeline.md) | every dependency's changes across all runs |
| [state/](state/) | machine snapshots the comparisons are made from (no vulnerability data) |
| [private_test/sensitive-report.EXAMPLE.md](private_test/sensitive-report.EXAMPLE.md) | **example with fake data** — what the private report looks like |

## Why there is no real `private/` folder here

LifeLine splits every report in two. The private part lists open vulnerabilities, what
breaks when a service disappears, how backups and secrets are handled, and which tools
run unpinned code. None of that is a leak on its own; together it reads like a map of
where an attack would hurt most.

So `private/` is listed in [.gitignore](.gitignore) and never committed. It goes to the
customer only, outside GitHub: on a USB stick, by encrypted e-mail, or by hand. The
public report does not even say how many open items there are; it ends with the date
and the sha256 of the private report, so the recipient can check the file they got.

To show the format anyway, this repository has a separate folder, `private_test/`, with
one file, `sensitive-report.EXAMPLE.md`. **Every value in it is invented.** It is kept out
of `private/` on purpose, so the real folder stays empty in git and LifeLine's guard
("stop if git tracks anything under `private/`") keeps working without exceptions. If you
use LifeLine in your own project, do not commit your `private/` folder.
