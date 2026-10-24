#!/bin/sh
# Haftalık D1 yedeğinin launchd ajanını kurar (macOS). Şablondaki __SERVER_DIR__
# bu kopyanın gerçek yoluyla doldurulur - depo taşınırsa bu betiği yeniden çalıştır.
# Kaldırmak: launchctl unload ~/Library/LaunchAgents/app.chessrun.backup.plist
set -eu
cd "$(dirname "$0")/.."
dir=$(pwd -P)
dest="$HOME/Library/LaunchAgents/app.chessrun.backup.plist"
mkdir -p "$HOME/Library/LaunchAgents" backups
launchctl unload "$dest" 2>/dev/null || true
sed "s|__SERVER_DIR__|$dir|g" scripts/app.chessrun.backup.plist > "$dest"
plutil -lint "$dest" >/dev/null
launchctl load "$dest"
echo "kuruldu: $dest -> $dir/scripts/backup.sh (Pazartesi 09:00)"
