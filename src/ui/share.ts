import type { GameMode, PieceType } from '../engine/types'
import type { StringKey } from './i18n'
import { GLYPH } from './pieces'
import type { Translate } from './text'

/**
 * Paylaşım kartı.
 *
 * Wordle'ın ızgarası gibi tek bakışta okunan bir görsel arıyoruz; bu oyunda
 * o görsel **dönüşüm zinciri**: "vezirdim, piyona düştüm" koşunun hikâyesi.
 * Şah Kaçışı'nda zincir olmadığı için yerini dayanılan satırların çubuğu
 * alıyor (her blok 5 satır).
 *
 * Metin oyuncunun kendi dilinde çıkıyor: paylaşılan kartı okuyan da
 * çoğunlukla aynı çevrede.
 */
export interface ShareInput {
  mode: GameMode
  day: string
  score: number
  distance: number
  chain: PieceType[]
  streak: number
  mated?: boolean
}

const MODE_NAME_KEY: Record<GameMode, StringKey> = {
  classic: 'mode.classic.name',
  kingRun: 'mode.kingRun.name',
  trio: 'mode.trio.name',
  daily: 'mode.daily.name',
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

/** Her blok 5 satır; en fazla 10 blok gösterilir */
function distanceBar(distance: number): string {
  const filled = Math.min(10, Math.floor(distance / 5))
  return '🟩'.repeat(filled) + '⬛'.repeat(Math.max(0, Math.min(10, Math.ceil(distance / 5)) - filled))
}

export function shareText(input: ShareInput, t: Translate): string {
  const lines = [`${t(MODE_NAME_KEY[input.mode])} · ${formatDay(input.day)}`]

  if (input.mode === 'classic' || input.mode === 'daily') {
    lines.push(input.chain.map((type) => GLYPH[type]).join('→'))
    lines.push(
      `${t('share.points', { n: input.score })} · ${t('share.rows', { n: input.distance })}`,
    )
  } else {
    lines.push(distanceBar(input.distance))
    lines.push(
      [
        t('share.rowsSurvived', { n: input.distance }),
        input.mated ? t('share.mated') : null,
        t('share.points', { n: input.score }),
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }

  if (input.streak > 1) lines.push(t('share.streak', { n: input.streak }))

  return lines.join('\n')
}

/**
 * Panoya kopyalama: önce modern API, olmazsa gizli textarea + execCommand.
 * İkincisi eski Safari ve güvenli olmayan bağlamlar için duruyor.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // izin yok ya da güvenli bağlam değil — eski yönteme düş
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** Önce sistem paylaşım sayfası, yoksa (ya da iptal edilirse) pano */
export async function shareRun(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text })
      return 'shared'
    }
  } catch {
    // kullanıcı vazgeçti ya da paylaşım reddedildi — panoya düş
  }

  return (await copyText(text)) ? 'copied' : 'failed'
}
