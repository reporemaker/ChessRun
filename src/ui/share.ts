import type { GameMode, PieceType } from '../engine/types'
import type { Lang, StringKey } from './i18n'
import { localeOf } from './i18n'
import { GLYPH } from './pieces'
import { FIGURE_OF_GLYPH, figureImage } from './figures'
import { iconPath } from './pieceIconPaths'
import type { Translate } from './text'

/**
 * Paylaşım (18 Ağustos yeniden tasarımı, bkz. paylas.html):
 *
 *   1. Metin: emojisiz, oyuncunun dilinde, kısa. Sonunda paylaşılan OYUNA
 *      giden bağlantı (chessrun.app/s/?g=…) - Worker o adreste paylaşanın
 *      dilinde önizleme (og) verir, insanı oyuna yönlendirir.
 *   2. Görsel kart: 1080×1080 PNG, oyuncunun dilinde, figürler kendi SVG
 *      yollarımızdan (fonttan bağımsız). Web Share dosya destekliyorsa
 *      resim + açıklama + bağlantı tek mesajda gider (WhatsApp, Instagram).
 *   3. Sistem paylaşımı yoksa (masaüstü): platform bağlantıları
 *      (WhatsApp · Telegram · X · Facebook) + panoya kopyala + PNG indir.
 */
export interface ShareInput {
  mode: GameMode
  /** Yerel takvim günü (günlükte tahtanın günü) */
  day: string
  score: number
  distance: number
  captures: number
  chain: PieceType[]
  streak: number
  name: string
  lang: Lang
  mated?: boolean
  /** Günlük: bugünkü çarpan (1 + puan/1000) */
  bonus?: number
}

/** Paylaşım bağlantıları her zaman gerçek siteye gider (yerelde de) */
export const SHARE_ORIGIN = 'https://chessrun.app'

const MODE_NAME_KEY: Record<GameMode, StringKey> = {
  classic: 'mode.classic.name',
  kingRun: 'mode.kingRun.name',
  trio: 'mode.trio.name',
  daily: 'mode.daily.name',
}

function formatDay(day: string, lang: Lang): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Date(y, m - 1, d).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long' })
}

function formatBonus(bonus: number, lang: Lang): string {
  return bonus.toLocaleString(localeOf(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Oyuna giden hedef: uygulama ?g= görünce o kartı vurgular */
export function shareTarget(input: Pick<ShareInput, 'mode' | 'day'>): string {
  return input.mode === 'daily'
    ? `${SHARE_ORIGIN}/?g=daily&d=${input.day}`
    : `${SHARE_ORIGIN}/?g=${input.mode}`
}

/**
 * Paylaşılan bağlantı: /s/ rotası. Botlar buradan dilinde başlık/açıklama/
 * görsel okur, insan oyuna yönlendirilir. Parametreler kısa ve açık.
 */
export function shareUrl(input: ShareInput): string {
  const q = new URLSearchParams()
  q.set('g', input.mode)
  if (input.mode === 'daily') q.set('d', input.day)
  q.set('p', String(input.score))
  q.set('r', String(input.distance))
  q.set('c', String(input.captures))
  q.set('n', input.name.slice(0, 24))
  q.set('l', input.lang)
  if (input.streak > 1) q.set('k', String(input.streak))
  return `${SHARE_ORIGIN}/s/?${q.toString()}`
}

/** Bağlantısız açıklama - resmin altına, önizlemenin yanına */
export function shareCaption(input: ShareInput, t: Translate): string {
  const head =
    input.mode === 'daily'
      ? `ChessRun · ${t(MODE_NAME_KEY.daily)} · ${formatDay(input.day, input.lang)}`
      : `ChessRun · ${t(MODE_NAME_KEY[input.mode])}`
  const stats = [
    t('share.points', { n: input.score }),
    t('share.rows', { n: input.distance }),
    input.mode === 'kingRun' ? null : t('share.caps', { n: input.captures }),
    input.mated ? t('share.mated') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const lines = [head, stats]
  if (input.mode === 'daily' && input.bonus && input.bonus > 1) {
    lines.push(t('share.bonus', { x: formatBonus(input.bonus, input.lang) }))
  }
  if (input.streak > 1) lines.push(t('share.streak', { n: input.streak }))
  return lines.join('\n')
}

/** Tam metin: açıklama + çağrı + bağlantı */
export function shareText(input: ShareInput, t: Translate): string {
  const cta = input.mode === 'daily' ? t('share.cta') : t('share.ctaFree')
  return `${shareCaption(input, t)}\n${cta} ${shareUrl(input)}`
}

/* ------------------------------------------------------------------ *
 * Görsel kart (canvas)
 * ------------------------------------------------------------------ */

const CARD = 1080

/** Figürlerin görselleri (figures.tsx); yoksa siluet */
type PieceImages = ReadonlyMap<string, HTMLImageElement>

function drawIcon(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number, size: number, art?: PieceImages): void {
  const img = art?.get(glyph)
  if (img) {
    // Kare tuval, figür taban hizalı - olduğu gibi ölçekle
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
    return
  }
  const d = iconPath(glyph)
  ctx.save()
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(size / 100, size / 100)
  if (d) {
    ctx.fill(new Path2D(d), 'evenodd')
  } else {
    ctx.font = `${size * 0.9}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph, 50, 50)
  }
  ctx.restore()
}

/** Kartın figürleri: Kaçış'ta tek şah, diğerlerinde zincirin son 5'i */
function cardGlyphs(input: ShareInput): string[] {
  return input.mode === 'kingRun' ? ['♚'] : input.chain.slice(-5).map((type) => GLYPH[type])
}

/**
 * Kartı çizer; canvas döner (test edilebilir, PNG'ye çevrilebilir).
 * `art` verilirse figürler çizim setinden (ana sayfayla aynı), yoksa siluet -
 * yükleme `shareCardFile`'da, çizim kendisi eşzamanlı kalıyor.
 */
export function drawShareCard(input: ShareInput, t: Translate, art?: PieceImages): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = CARD
  cv.height = CARD
  const ctx = cv.getContext('2d')
  if (!ctx) return cv
  const W = CARD
  const H = CARD
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

  ctx.fillStyle = '#0e1015'
  ctx.fillRect(0, 0, W, H)
  const cell = 90
  for (let r = 0; r < H / cell; r++) {
    for (let c = 0; c < W / cell; c++) {
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.015)'
      ctx.fillRect(c * cell, r * cell, cell, cell)
    }
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(14,16,21,.15)')
  grad.addColorStop(1, 'rgba(14,16,21,.9)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffd23f'
  ctx.font = `700 44px ${mono}`
  ctx.fillText('CHESSRUN', W / 2, 110)
  ctx.fillStyle = '#93a3b8'
  ctx.font = `400 30px ${mono}`
  const sub =
    input.mode === 'daily'
      ? `${t(MODE_NAME_KEY.daily)} · ${formatDay(input.day, input.lang)}`
      : t(MODE_NAME_KEY[input.mode])
  ctx.fillText(sub.toUpperCase(), W / 2, 165)

  // Zincir: figürler ok ile; Kaçış'ta tek şah. Çizim figürü kutusunun
  // ~%70'ini dolduruyor, siluetten biraz büyük çizilir ki aynı ağırlıkta görünsün
  ctx.fillStyle = '#f2f7ff'
  const glyphs = cardGlyphs(input)
  const size = (glyphs.length > 3 ? 120 : 150) * (art ? 1.3 : 1)
  const gap = size * (art ? 0.35 : 0.55)
  const total = glyphs.length * size + (glyphs.length - 1) * gap
  let x = W / 2 - total / 2 + size / 2
  glyphs.forEach((g, i) => {
    drawIcon(ctx, g, x, 400, size, art)
    if (i < glyphs.length - 1) {
      ctx.fillStyle = '#93a3b8'
      ctx.font = `400 ${size * 0.5}px ${mono}`
      ctx.fillText('→', x + size / 2 + gap / 2, 400)
      ctx.fillStyle = '#f2f7ff'
    }
    x += size + gap
  })

  ctx.fillStyle = '#ffd23f'
  ctx.font = `800 220px ${mono}`
  ctx.fillText(String(input.score), W / 2, 640)
  ctx.fillStyle = '#e6ecf5'
  ctx.font = `400 38px ${mono}`
  // Büyük sayı zaten puan: altta yalnızca satır ve yeme
  const line = [
    t('share.rows', { n: input.distance }),
    input.mode === 'kingRun' ? null : t('share.caps', { n: input.captures }),
  ]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase()
  ctx.fillText(line, W / 2, 760)

  const bx = 190
  const by = 820
  const bw = W - 380
  ctx.fillStyle = 'rgba(255,255,255,.1)'
  ctx.fillRect(bx, by, bw, 26)
  ctx.fillStyle = '#ffd23f'
  ctx.fillRect(bx, by, Math.min(bw, (bw * input.score) / 1000), 26)
  if (input.mode === 'daily' && input.bonus && input.bonus > 1) {
    ctx.fillStyle = '#93a3b8'
    ctx.font = `400 30px ${mono}`
    ctx.fillText(t('share.bonus', { x: formatBonus(input.bonus, input.lang) }), W / 2, 890)
  }
  ctx.fillStyle = '#93a3b8'
  ctx.font = `400 34px ${mono}`
  const foot = input.streak > 1 ? `${input.name} · ${t('share.streak', { n: input.streak })}` : input.name
  ctx.fillText(foot, W / 2, 970)
  ctx.fillStyle = '#ffd23f'
  ctx.font = `700 40px ${mono}`
  ctx.fillText('chessrun.app', W / 2, 1030)
  return cv
}

/** Kartta gereken figürlerin görselleri; yüklenemeyen atlanır (siluete düşer) */
async function loadCardArt(input: ShareInput): Promise<PieceImages> {
  const art = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...new Set(cardGlyphs(input))].map(async (glyph) => {
      const name = FIGURE_OF_GLYPH[glyph]
      const img = name ? await figureImage(name) : null
      if (img) art.set(glyph, img)
    }),
  )
  return art
}

export async function shareCardFile(input: ShareInput, t: Translate): Promise<File | null> {
  try {
    const cv = drawShareCard(input, t, await loadCardArt(input))
    const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, 'image/png'))
    return blob ? new File([blob], 'chessrun.png', { type: 'image/png' }) : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Platform bağlantıları (masaüstü ve sistem paylaşımı olmayan yerler)
 * ------------------------------------------------------------------ */

export interface PlatformLinks {
  whatsapp: string
  telegram: string
  x: string
  facebook: string
}

export function platformLinks(input: ShareInput, t: Translate): PlatformLinks {
  const url = shareUrl(input)
  const cap = shareCaption(input, t)
  const full = shareText(input, t)
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(full)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(cap)}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(cap)}&url=${encodeURIComponent(url)}`,
    // Facebook metin almaz: yalnızca bağlantı; başlık/açıklama /s/ rotasının og etiketlerinden
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  }
}

/* ------------------------------------------------------------------ *
 * Sistem paylaşımı / pano
 * ------------------------------------------------------------------ */

/**
 * Panoya kopyalama: önce modern API, olmazsa gizli textarea + execCommand.
 * İkincisi eski Safari ve güvenli olmayan bağlamlar için duruyor.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // izin yok ya da güvenli bağlam değil - eski yönteme düş
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

/** Sistem paylaşım sayfası var mı (masaüstü tarayıcıların çoğunda yok) */
export function canSystemShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export type ShareOutcome = 'shared' | 'copied' | 'failed'

/**
 * Sistem paylaşımı: dosya destekleniyorsa resim + açıklama + bağlantı tek
 * pakette (bağlantı `text` içinde: WhatsApp resimli mesajda `url` alanını
 * her zaman göstermiyor); değilse açıklama + url (önizleme kartı çıkar).
 * Sistem paylaşımı yoksa metin panoya.
 */
export async function shareRun(input: ShareInput, t: Translate): Promise<ShareOutcome> {
  const text = shareText(input, t)
  try {
    if (canSystemShare()) {
      const file = await shareCardFile(input, t)
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
        return 'shared'
      }
      await navigator.share({ text: shareCaption(input, t), url: shareUrl(input) })
      return 'shared'
    }
  } catch {
    // kullanıcı vazgeçti ya da paylaşım reddedildi - panoya düş
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}

/** PNG indir (masaüstü) */
export async function downloadShareCard(input: ShareInput, t: Translate): Promise<boolean> {
  const file = await shareCardFile(input, t)
  if (!file) return false
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = 'chessrun.png'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
