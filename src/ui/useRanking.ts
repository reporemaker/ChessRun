import { useEffect, useMemo, useState } from 'react'
import { leaderboardEnabled } from './leaderboard'
import { type RankingView, fetchRanking, readRanking } from './ranking'

export type RankingStatus =
  /** Sunucu tanımlı değil - liste kendi koşuların */
  | 'local'
  /** Sunucu cevabı bekleniyor; yerel görünüm çiziliyor */
  | 'loading'
  /** Sunucu görünümü */
  | 'live'
  /** Sunucu ulaşılamadı; yerel görünümde kalındı */
  | 'offline'

/**
 * Sıralamanın tek React girişi - ayarlar özeti, oyun sonu kartı, ana sayfa
 * satırı ve sıralama penceresi aynı kancayı kullanıyor. Tablo tek: ortak
 * lig (bütün oyunların haftalık toplamı).
 *
 * Yerel görünüm anında (senkron), sunucu görünümü gelince yerini alıyor.
 * `refresh` değişince (koşu bitti) ikisi de tazeleniyor. Geç gelen cevap
 * `alive` ile düşüyor.
 */
export function useRanking(refresh?: unknown): { view: RankingView; status: RankingStatus } {
  const local = useMemo(() => readRanking(), [refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const [remote, setRemote] = useState<RankingView | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setRemote(null)
    setOffline(false)
    if (!leaderboardEnabled) return
    let alive = true
    void fetchRanking().then((v) => {
      if (!alive) return
      if (v) setRemote(v)
      else setOffline(true)
    })
    return () => {
      alive = false
    }
  }, [refresh])

  const status: RankingStatus = !leaderboardEnabled ? 'local' : remote ? 'live' : offline ? 'offline' : 'loading'
  return { view: remote ?? local, status }
}
