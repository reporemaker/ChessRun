import { useEffect, useMemo, useState } from 'react'
import type { GameMode } from '../engine/types'
import { leaderboardEnabled } from './leaderboard'
import { type RankingView, fetchRanking, readRanking, weekMode } from './ranking'

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
 * satırı ve sıralama penceresi aynı kancayı kullanıyor.
 *
 * Yerel görünüm anında (senkron), sunucu görünümü gelince yerini alıyor.
 * `mode` verilmezse bu haftanın ligi (`weekMode`). `refresh` değişince
 * (koşu bitti) ikisi de tazeleniyor. Geç gelen cevap `alive` ile düşüyor.
 */
export function useRanking(mode?: GameMode, refresh?: unknown): { view: RankingView; status: RankingStatus } {
  const resolved = useMemo(() => mode ?? weekMode(), [mode, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const local = useMemo(() => readRanking(mode), [mode, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const [remote, setRemote] = useState<RankingView | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setRemote(null)
    setOffline(false)
    if (!leaderboardEnabled) return
    let alive = true
    void fetchRanking(resolved).then((v) => {
      if (!alive) return
      if (v) setRemote(v)
      else setOffline(true)
    })
    return () => {
      alive = false
    }
  }, [resolved, refresh])

  const status: RankingStatus = !leaderboardEnabled ? 'local' : remote ? 'live' : offline ? 'offline' : 'loading'
  return { view: remote ?? local, status }
}
