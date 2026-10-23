import type { MhState } from '../engine/maharajah'
import { tuningActive } from '../engine/tuning'
import { RESUME_TTL_MS } from './resume'

/**
 * Mihrace'nin devam fişi - kayan tahta oyunlarının fişiyle (ui/resume) aynı
 * kurallar: her hamlede localStorage'a, oyun bitince / çıkınca silinir,
 * 30 dakikada eskir. Ayrı anahtar: Mihrace GameConfig'e girmiyor, durumu
 * (MhState) zaten saf veri - olduğu gibi saklanır.
 *
 * Açılışta App sorar (ana sayfada ya da /play/maharajah'ta): «Oyunun yarım
 * kaldı — DEVAM ET / VAZGEÇ». Kabul edilirse MaharajahGame fişle kurulur.
 */
export const MH_RESUME_KEY = 'chessrun:mh-resume'

export interface MhTicket {
  v: 1
  savedAt: number
  game: MhState
  /** Oyunun başladığı gün ve o anki günlük puan - çarpan oyun başında sabit */
  runDay: string
  dailyToday: number | null
  /** Oyunun o ana kadar geçen süresi (istatistik için) */
  elapsedMs: number
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function saveMhResume(ticket: Omit<MhTicket, 'v' | 'savedAt'>, now = Date.now()): void {
  if (tuningActive()) return
  try {
    store()?.setItem(MH_RESUME_KEY, JSON.stringify({ v: 1, savedAt: now, ...ticket } satisfies MhTicket))
  } catch {
    // kota / özel mod - devam sessizce kapalı
  }
}

export function clearMhResume(): void {
  try {
    store()?.removeItem(MH_RESUME_KEY)
  } catch {
    // yoksay
  }
}

/** Geçerli fiş ya da null; bozuk, eski ya da bitmiş oyun fişi silinir */
export function readMhResume(now = Date.now()): MhTicket | null {
  let raw: string | null = null
  try {
    raw = store()?.getItem(MH_RESUME_KEY) ?? null
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as MhTicket
    const g = t?.game
    const ok =
      t?.v === 1 &&
      typeof t.savedAt === 'number' &&
      now - t.savedAt <= RESUME_TTL_MS &&
      t.savedAt <= now + 60_000 &&
      typeof t.runDay === 'string' &&
      !!g &&
      (g.mode === 'falcon' || g.mode === 'hunter') &&
      Array.isArray(g.board) &&
      g.board.length === 8 &&
      g.result == null &&
      typeof g.plies === 'number' &&
      g.plies > 0
    if (!ok) {
      clearMhResume()
      return null
    }
    return t
  } catch {
    clearMhResume()
    return null
  }
}
