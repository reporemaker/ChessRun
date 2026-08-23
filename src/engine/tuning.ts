/**
 * Zorluk eğrisi el ayarı - YALNIZCA yerel geliştirme testi için.
 *
 * Amaç: koşu süresini uzatacak eğriyi (taban yoğunluk · basamak aralığı ·
 * basamak yüksekliği) elle kaydırıp dört oyunda da oynayarak hissetmek.
 * Üretimde bu modüle yazan tek yer (TuningPanel) pakete hiç girmediği
 * için `active` daima null kalır ve eğri sabitlerden okunur.
 *
 * Bilerek bağımlılıksız: config.ts ve daily.ts buradan OKUR, panel buraya
 * YAZAR - config'e bağlansaydı döngü olurdu.
 */
export interface DifficultyTuning {
  /** Kaç satırda bir seviye atlanır */
  step: number
  /** Satır başına doğan taş tabanı */
  base: number
  /** Seviye başına yoğunluk artışı */
  inc: number
}

/**
 * Panel kaydırıcılarının referans noktası: 23 Ağustos 2026 öncesinin
 * ortak eğrisi. Günlük mücadele eşlemesi (daily.ts) panel değerlerini bu
 * referansa ORANLAYARAK uygular; canlı eğriler artık mod bazlı olduğu
 * için (config.DIFFICULTY) bu üçlü yalnızca ölçek çıpası olarak yaşıyor.
 */
export const TUNING_REFERENCE: DifficultyTuning = { step: 12, base: 0.75, inc: 0.15 }

let active: DifficultyTuning | null = null

export function setDifficultyTuning(tuning: DifficultyTuning | null): void {
  active = tuning
}

export function difficultyTuning(): DifficultyTuning | null {
  return active
}

/** Test kipi açık mı? Açıkken kayıt/gönderim/rozet yazımı susturulur. */
export function tuningActive(): boolean {
  return active !== null
}
