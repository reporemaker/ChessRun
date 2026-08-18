/**
 * ISO hafta aritmetiği, UTC. Sunucu (kabul penceresi, geçen hafta) ve
 * istemci (lig rozetleri: ardışık hafta sayımı) aynı hesabı kullanıyor.
 * Anahtar biçimi `2026-W34`; dizgi sıralaması takvim sıralamasıyla aynı.
 */

const DAY = 86_400_000

/** ISO hafta anahtarı: 2026-W33 */
export function isoWeekUtc(ms: number): string {
  const d = new Date(ms)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** ISO haftanın Pazartesi 00:00 UTC'si. 4 Ocak her zaman 1. haftadadır. */
export function weekStartUtc(week: string): number {
  const year = Number(week.slice(0, 4))
  const n = Number(week.slice(6))
  const jan4 = Date.UTC(year, 0, 4)
  const jan4Day = new Date(jan4).getUTCDay() || 7
  return jan4 - (jan4Day - 1) * DAY + (n - 1) * 7 * DAY
}

/** Önceki ISO hafta - yıl sınırını takvim çözüyor (52/53) */
export function previousWeek(week: string): string {
  return isoWeekUtc(weekStartUtc(week) - DAY)
}

/** Sonraki ISO hafta */
export function nextWeek(week: string): string {
  return isoWeekUtc(weekStartUtc(week) + 7 * DAY)
}
