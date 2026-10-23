import type { ReactNode } from 'react'
import type { GameMode } from '../engine/types'
import { type Identity, shortToken } from '../ui/identity'
import { LANGS } from '../ui/i18n'
import type { RankingView } from '../ui/ranking'
import type { RankingStatus } from '../ui/useRanking'
import { BOARD_THEMES, setBoard, setLang, setPieceColor, setSound, useSettings } from '../ui/settings'
import { useT } from '../ui/text'
import { APP_VERSION } from '../ui/version'
import { BadgeChip } from './BadgeChip'
import { FeedbackLink } from './FeedbackLinks'
import { NameChip } from './NameChip'

/**
 * Masaüstü sağ sütununun oyunlardan bağımsız alt yarısı: ayarlar, künye,
 * rozet, sıralama ve bağlantılar. Av/Kaçış/Üçlü (Game), Günün Mücadelesi
 * (DailyGame) ve Mihrace aynı bileşeni çiziyor - üçü aynı görünsün.
 *
 * Ayar sırası ayarlar penceresiyle aynı: taş rengi → tahta → koridor →
 * ses → dil. Yalnızca bazı oyunlarda olan iki alan dışarıdan takılıyor:
 * `speed` (en üstte) ve `corridor` (tahtadan sonra).
 */
interface Props {
  identity: Identity
  onIdentityChange: (identity: Identity) => void
  ranking: RankingView
  rankStatus: RankingStatus
  badgeVersion: number
  /** Öneri mailinin konusu için */
  mode?: GameMode
  speed?: ReactNode
  corridor?: ReactNode
  onOpenBadges: () => void
  onOpenRanking: () => void
  onOpenHelp: () => void
}

/* Reklam yalnızca gerçek bir slot tanımlıysa çiziliyor - tanımsızken
   yer tutucu kutu göstermiyoruz. Açıldığında dış servis değil, kendi
   işlerimizin duyurusu (yapilacaklar.md). */
const AD_SLOT = import.meta.env.VITE_AD_SLOT as string | undefined

export function SidePanel({
  identity,
  onIdentityChange,
  ranking,
  rankStatus,
  badgeVersion,
  mode,
  speed,
  corridor,
  onOpenBadges,
  onOpenRanking,
  onOpenHelp,
}: Props) {
  const t = useT()
  const settings = useSettings()

  return (
    <>
      <div className="gv-hr" />

      <div className="gv-set">
        <span className="gv-lb">{t('settings.title')}</span>

        {speed}

        <span className="gv-field">
          <span className="gv-tx">{t('settings.pieceColor')}</span>
          <span className="gv-seg">
            {(['w', 'b'] as const).map((color) => (
              <button
                key={color}
                type="button"
                className={settings.pieceColor === color ? 'on' : ''}
                aria-pressed={settings.pieceColor === color}
                onClick={() => setPieceColor(color)}
              >
                {color === 'w' ? t('settings.white') : t('settings.black')}
              </button>
            ))}
          </span>
        </span>

        <span className="gv-field">
          <span className="gv-tx">{t('settings.board')}</span>
          <span className="gv-seg">
            {BOARD_THEMES.map((board) => (
              <button
                key={board}
                type="button"
                className={settings.board === board ? 'on' : ''}
                aria-pressed={settings.board === board}
                onClick={() => setBoard(board)}
              >
                {board === 'vintage' ? t('settings.boardVintage') : t('settings.boardClassic')}
              </button>
            ))}
          </span>
        </span>

        {corridor}

        <span className="gv-field">
          <span className="gv-tx">{t('hud.sound')}</span>
          <span className="gv-seg">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                className={settings.sound === on ? 'on' : ''}
                aria-pressed={settings.sound === on}
                onClick={() => setSound(on)}
              >
                {on ? t('settings.soundOn') : t('settings.soundOff')}
              </button>
            ))}
          </span>
        </span>

        <span className="gv-field">
          <span className="gv-tx">{t('settings.lang')}</span>
          <span className="gv-seg">
            {LANGS.map((entry) => (
              <button
                key={entry.code}
                type="button"
                className={settings.lang === entry.code ? 'on' : ''}
                aria-pressed={settings.lang === entry.code}
                onClick={() => setLang(entry.code)}
              >
                {entry.label}
              </button>
            ))}
          </span>
        </span>
      </div>

      <div className="gv-hr" />

      {/* Künye: sürüm · cihaz · ad (kalemle düzenlenir) - pencereyle aynı */}
      <div className="gv-meta">
        <span className="gv-chip">
          v<b>{APP_VERSION}</b>
        </span>
        <span className="gv-chip">
          #<b>{shortToken(identity.token)}</b>
        </span>
        <NameChip identity={identity} onChange={onIdentityChange} skin="gv" />
      </div>

      <div className="gv-hr" />

      {/* Rozet: yalnızca seçili olan + pencereyi açan düğme */}
      <BadgeChip version={badgeVersion} onOpen={onOpenBadges} skin="gv" />

      <div className="gv-hr" />

      {/* Sıralama özeti: üç sayı; tam liste kendi penceresinde */}
      <button type="button" className="gv-rank" onClick={onOpenRanking}>
        <span className="gv-lb">{t('settings.ranking')}</span>
        <span className="gv-rank-row">
          <span className="gv-cell">
            <span className="gv-n md gold">{ranking.rank == null ? '-' : `#${ranking.rank}`}</span>
            <span className="gv-lb">{t('settings.rankMine')}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-n md">{ranking.score}</span>
            <span className="gv-lb">{t('settings.scoreMine')}</span>
          </span>
          <span className="gv-cell">
            <span className="gv-n md">{ranking.players ?? '-'}</span>
            <span className="gv-lb">{t('settings.players')}</span>
          </span>
        </span>
        <span className="gv-rank-ft">
          <span>{t('settings.openFull')}</span>
          {rankStatus === 'local' && <i>{t('settings.serverPending')}</i>}
          {rankStatus === 'offline' && <i>{t('rank.offline')}</i>}
        </span>
      </button>

      {/* Nasıl oynanır tek başına tam genişlik düğme; altında Hakkında +
          Öneri iki düğme yan yana - üçü aynı düğme dilinde */}
      <div className="gv-btns one">
        <button type="button" onClick={onOpenHelp}>
          {t('settings.howTo')}
        </button>
      </div>
      <div className="gv-btns">
        {/* Hakkında: pencere değil /about statik sayfası; koşu devam
            fişiyle (ui/resume) geri çağrılır */}
        <button type="button" onClick={() => window.location.assign('/about')}>
          {t('settings.about')}
        </button>
        <FeedbackLink lang={settings.lang} mode={mode} />
      </div>

      {AD_SLOT && <div className="gv-ad">REKLAM</div>}
    </>
  )
}
