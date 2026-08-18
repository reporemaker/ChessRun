import { useSyncExternalStore } from 'react'
import { COL_CHOICES, DEFAULT_CORRIDOR_COLS, LEGACY_CORRIDOR } from '../engine/config'
import type { Color } from '../engine/types'
import { DEFAULT_LANG, type Lang, isLang } from './i18n'
import { isMuted, setMuted, unlockSound } from './sound'

/**
 * Ayarlar penceresinin durumu.
 *
 * Ses burada saklanmıyor: tek kaynağı `sound.ts` (kendi anahtarı var ve oyun
 * içindeki ses düğmesi de onu kullanıyor). Burada yalnızca aynalanıyor ki
 * pencere ile oyun içi düğme birbirinden habersiz kalmasın.
 */
export interface Settings {
  pieceColor: Color
  sound: boolean
  lang: Lang
  /** Koridor genişliği, sütun olarak (4-8) - yalnızca serbest oyunları etkiliyor */
  cols: number
}

const STORAGE_KEY = 'chessrun:settings'

interface Stored {
  pieceColor?: Color
  lang?: Lang
  cols?: number
  /** Eski sürüm: 'narrow' | 'medium' | 'wide' - okunurken sayıya çevriliyor */
  corridor?: string
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Stored
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function save(stored: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // depolama kapalı: ayarlar bu oturumla sınırlı kalır
  }
}

function initial(): Settings {
  const stored = load()
  return {
    pieceColor: stored.pieceColor === 'b' ? 'b' : 'w',
    lang: isLang(stored.lang) ? stored.lang : detectLang(),
    cols: readCols(stored),
    sound: !isMuted(),
  }
}

/** Sütun: yeni alan varsa o, yoksa eski adlandırılmış kademe, yoksa varsayılan */
function readCols(stored: Stored): number {
  if (typeof stored.cols === 'number' && COL_CHOICES.includes(stored.cols)) return stored.cols
  if (stored.corridor && stored.corridor in LEGACY_CORRIDOR) return LEGACY_CORRIDOR[stored.corridor]
  return DEFAULT_CORRIDOR_COLS
}

/** İlk açılışta tarayıcının dilini dene; tutmazsa Türkçe */
function detectLang(): Lang {
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const code = tag.slice(0, 2).toLowerCase()
      if (isLang(code)) return code
    }
  } catch {
    // navigator yoksa varsayılan
  }
  return DEFAULT_LANG
}

const listeners = new Set<() => void>()
let snapshot: Settings = initial()

function commit(next: Settings): void {
  snapshot = next
  save({ pieceColor: next.pieceColor, lang: next.lang, cols: next.cols })
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSettings(): Settings {
  return snapshot
}

export function setPieceColor(pieceColor: Color): void {
  if (snapshot.pieceColor === pieceColor) return
  commit({ ...snapshot, pieceColor })
}

export function setCols(cols: number): void {
  if (!COL_CHOICES.includes(cols) || snapshot.cols === cols) return
  commit({ ...snapshot, cols })
}

export function setLang(lang: Lang): void {
  if (snapshot.lang === lang) return
  commit({ ...snapshot, lang })
}

export function setSound(sound: boolean): void {
  if (snapshot.sound === sound) return
  setMuted(!sound)
  if (sound) unlockSound()
  commit({ ...snapshot, sound })
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings)
}
