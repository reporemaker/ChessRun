# VENDORED.md — Vendored Code Ledger

Code and assets copied into this repo from outside. Every entry is checked for upstream
updates and CVEs by the LifeLine skill (Step 4). Do not remove entries whose files still exist.

## retro-fonts
- Source: https://fonts.google.com  # Press Start 2P and VT323, woff2 subsets (latin, latin-ext) as served by fonts.gstatic.com
- Ecosystem: none
- Package-Name: none
- Version: Google Fonts subsets, downloaded 2026-08-23
- Vendored-Date: 2026-08-23
- License: OFL-1.1
- Attribution: public/fonts/OFL-PressStart2P.txt, public/fonts/OFL-VT323.txt (verbatim from github.com/google/fonts, ofl/pressstart2p and ofl/vt323)
- Location: public/fonts
- Checksum: sha256:565c07586d0a078a45cbd0216a99b36c61fe286c94fc1d7acafb4c4f10e7fa0f
- Modifications: none
- Reason: self-hosted so the game and the About page load no third-party font CDN
- Last-Checked: 2026-10-24
- Status: no machine-readable upstream version; compare with Google Fonts by hand once a year
