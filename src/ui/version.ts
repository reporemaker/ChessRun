import { version } from '../../package.json'

/**
 * Sürüm - TEK KAYNAK package.json. Künye, ana sayfa imzası, istatistik ve
 * öneri maili buradan okur. Hakkında sayfası (public/about.html) ve README
 * elle yazılı; version.test.ts üçünün aynı olduğunu denetler. Yeni sürüm:
 * `npm version x.y.z --no-git-tag-version` (kök, server, sub), about.html,
 * README, remaker.ch'deki ChessRun kartı (rev), git etiketi vX.Y.Z.
 */
export const APP_VERSION: string = version

/**
 * İletişim adresi - tek kaynak. Hakkında sayfasında ve ileride hata
 * bildirimi gibi yerlerde bu kullanılıyor. Oyunun kendi alan adında değil,
 * SmartKraft'ta: ChessRun bir SmartKraft projesi (RE*maker kolektifinin parçası)
 * ve posta altyapısı orada.
 */
export const CONTACT_MAIL = 'chessrun@smartkraft.ch'
