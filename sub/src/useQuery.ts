import { useEffect, useState } from 'react'
import { ApiError } from './api'

/**
 * Küçük veri kancası — kütüphane yok.
 *
 * Üç durum: yükleniyor / hata / veri. Eski veri yeni istek gelene kadar
 * ekranda kalıyor (dönem değişince sayfa boşalıp titremiyor). Yarış
 * durumu `alive` bayrağıyla kesiliyor: geç gelen eski cevap yenisini
 * ezmiyor.
 */
export interface Query<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export function useQuery<T>(key: string, fetcher: () => Promise<T>): Query<T> {
  const [state, setState] = useState<Query<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (err: unknown) =>
        alive &&
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof ApiError ? err.message : 'Bağlantı yok — Worker çalışıyor mu?',
        })),
    )
    return () => {
      alive = false
    }
    // key, isteği tanımlayan her şeyi taşıyor; fetcher kapanışı ona bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
