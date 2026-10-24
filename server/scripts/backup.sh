#!/bin/sh
# D1 yedeği - yerel, GitHub yok. Üretim veritabanının tam SQL dökümü
# server/backups/ altına (git dışı). Elle: `npm run backup` (server/ içinde)
# ya da haftalık otomatik: launchd ajanı (aşağıdaki plist) - Mac açıkken
# Pazartesi 09:00'da çalışır, wrangler'ın kayıtlı oturumunu kullanır.
#
#   sh server/scripts/install-backup.sh   (şablonu bu kopyanın yoluyla kurar)
#   (kaldırmak: launchctl unload ~/Library/LaunchAgents/app.chessrun.backup.plist;
#   günlük: server/backups/backup.log)
#
# 12 dökümden eskisi silinir (~3 ay). lb_player / lb_profile / lb_recovery
# geri gelmeyen tablolar; D1 Time Travel Free planda yalnızca 7 gün.
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M)
npx wrangler d1 export chessrun --remote --output "backups/chessrun-$stamp.sql"
ls -t backups/chessrun-*.sql | tail -n +13 | xargs -I{} rm -f {}
echo "$(date '+%Y-%m-%d %H:%M') yedek: backups/chessrun-$stamp.sql ($(wc -c < "backups/chessrun-$stamp.sql") bayt)" >> backups/backup.log
