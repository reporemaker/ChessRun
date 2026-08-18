/**
 * Rozet kimliği → glif + Türkçe ad, panel için. Oyundaki `src/ui/badges.ts`
 * motor tiplerine bağlı olduğu için buraya alınmıyor; bu tablo yalnızca
 * gösterim (bilinmeyen kimlik ham hâliyle çizilir).
 */
export const BADGE_LABEL: Record<string, { glyph: string; name: string }> = {
  rook: { glyph: '♜', name: 'Kale' },
  knight: { glyph: '♞', name: 'At' },
  bishop: { glyph: '♝', name: 'Fil' },
  pawn: { glyph: '♟', name: 'Piyon' },
  queen: { glyph: '♛', name: 'Vezir' },
  king: { glyph: '♚', name: 'Şah' },
  musketeers: { glyph: '⚜︎', name: 'Üç Silahşörler' },
  harakiri: { glyph: '†', name: 'Harakiri' },
  oneUp: { glyph: '♥︎', name: '1UP' },
  chain: { glyph: '⚡︎', name: 'Zincir' },
  hunter: { glyph: '◎', name: 'Avcı' },
  mate: { glyph: '✕', name: 'Mat' },
  breath: { glyph: '○', name: 'Nefes' },
  transform: { glyph: '⟳', name: 'Dönüşüm' },
  sevenDays: { glyph: '▲', name: 'Yedi gün' },
  thirtyDays: { glyph: '◆', name: 'Otuz gün' },
  narrow: { glyph: '▬', name: 'Dar koridor' },
  weekFirst: { glyph: '①', name: 'Haftanın birincisi' },
  weekKing: { glyph: '♔', name: 'Kral' },
  emperor: { glyph: '✪', name: 'İmparator' },
}

export const TIER_LABEL: Record<string, string> = { black: 'siyah', bronze: 'bronz', silver: 'gümüş', gold: 'altın' }

export function badgeText(id: string | null | undefined, tier?: string | null): string {
  if (!id) return '-'
  const b = BADGE_LABEL[id]
  const t = tier ? ` · ${TIER_LABEL[tier] ?? tier}` : ''
  return b ? `${b.glyph} ${b.name}${t}` : `${id}${t}`
}
