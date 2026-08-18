import { readRuns } from './scores'

/**
 * Günde tek hak - cihaz tarafı.
 *
 * Hak KOŞU BAŞLAYINCA yanar (kapatıp kaçmayı önlemek için); bitmese de
 * ertesi güne kadar kilitli. İki kaynak birlikte okunuyor: kilit anahtarı
 * ve defterdeki günlük kayıt - biri silinse öbürü kalır. Sunucu tarafı
 * (jetonla) kalıcılık planıyla birlikte gelecek; localStorage silinince
 * yeni jeton = yeni hak, bunu şimdilik kabul ediyoruz.
 *
 * Geliştirmede kilit yok: test için aynı gün tekrar tekrar oynanabilir.
 */
const LOCK_KEY = 'chessrun:daily-lock'

export const DAILY_REPLAY_ALLOWED: boolean = import.meta.env.DEV

export function dailyPlayed(day: string): boolean {
  try {
    if (localStorage.getItem(LOCK_KEY) === day) return true
  } catch {
    // depolama kapalı: deftere bak
  }
  return readRuns().some((run) => run.mode === 'daily' && run.daily === day)
}

export function markDailyPlayed(day: string): void {
  try {
    localStorage.setItem(LOCK_KEY, day)
  } catch {
    // depolama kapalı: defter kaydı yedeği
  }
}
