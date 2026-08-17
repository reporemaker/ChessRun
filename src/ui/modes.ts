import { DEFAULT_COLS } from '../engine/config'
import { hashSeed } from '../engine/random'
import type { GameMode } from '../engine/types'
import type { StringKey } from './i18n'

/**
 * Ana sayfadaki dört kartın kaynağı.
 *
 * `ready` bayrağı motorda karşılığı olmayan modlar için: kart "yakında"
 * rozetiyle çiziliyor ve tıklanamıyor. Üçlü artık motorda var, bayrağı açık.
 */
export type ModeId = GameMode

export interface ModeInfo {
  id: ModeId
  glyph: string
  nameKey: StringKey
  lineKey: StringKey
  ready: boolean
  /** Kartın alt satırına sabitlenen slogan — varsa her zaman görünüyor */
  mottoKey?: StringKey
  /** Bu modun kendi varsayılan koridor genişliği */
  defaultCols: number
}

export const MODES: ModeInfo[] = [
  {
    id: 'classic',
    glyph: '♞',
    nameKey: 'mode.classic.name',
    lineKey: 'mode.classic.line',
    ready: true,
    defaultCols: DEFAULT_COLS,
  },
  {
    id: 'kingRun',
    glyph: '♚',
    nameKey: 'mode.kingRun.name',
    lineKey: 'mode.kingRun.line',
    ready: true,
    defaultCols: DEFAULT_COLS,
  },
  {
    id: 'trio',
    glyph: '♛',
    nameKey: 'mode.trio.name',
    lineKey: 'mode.trio.line',
    mottoKey: 'mode.trio.motto',
    ready: true,
    defaultCols: DEFAULT_COLS,
  },
]

export function modeInfo(id: ModeId): ModeInfo {
  return MODES.find((entry) => entry.id === id) ?? MODES[0]
}

export function isPlayable(id: ModeId): boolean {
  return modeInfo(id).ready
}

/**
 * Günün oyunu hangi mod? Tarihten türetiliyor, yani herkeste aynı —
 * "bugünün tahtası" hem aynı tohumu hem aynı modu paylaşıyor.
 */
export function dailyMode(day: string): GameMode {
  const playable = MODES.filter((entry) => entry.ready).map((entry) => entry.id as GameMode)
  return playable[hashSeed(`mode:${day}`) % playable.length]
}
