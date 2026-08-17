/**
 * İlk oyunda, tam ilgili an geldiğinde çıkan tek satırlık ipuçları.
 *
 * Modal bir öğretici yerine bunu seçtik: kılavuz kareleri kaldırdığımızdan
 * beri satranç bilmeyen oyuncunun tutunacağı bir şey yoktu, ama oyunu
 * durdurup ders anlatmak da runner temposunu öldürüyor. Her ipucu bir kez
 * gösterilir ve bir daha asla çıkmaz.
 */
import type { StringKey } from './i18n'

export type TipId = 'start' | 'transform' | 'check' | 'edge' | 'stuck' | 'king'

/** Metinler sözlükte yaşıyor; burada yalnızca hangi ipucunun hangi anahtar olduğu */
export const TIP_KEY: Record<TipId, StringKey> = {
  start: 'tip.start',
  transform: 'tip.transform',
  check: 'tip.check',
  edge: 'tip.edge',
  stuck: 'tip.stuck',
  king: 'tip.king',
}

const STORAGE_KEY = 'chessrun:tips'

export function readSeenTips(): Set<TipId> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return new Set()
    return new Set(JSON.parse(stored) as TipId[])
  } catch {
    return new Set()
  }
}

export function storeSeenTips(seen: Set<TipId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // depolama kapalıysa ipuçları her oturumda bir kez daha çıkar
  }
}

export function resetSeenTips(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // yoksay
  }
}
