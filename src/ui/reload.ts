/**
 * Sayfa yenilenmeden önce çalışacak işler - tek abone: App, süren koşuyu
 * `abandon()` ile deftere yazar (ve devam fişini siler). Kurtarma koduyla
 * kimlik geri yüklenince sayfa yenileniyor; eskiden süren koşu sessizce
 * kayboluyordu.
 */
type Hook = () => Promise<void> | void

let hook: Hook | null = null

export function setBeforeReload(fn: Hook | null): void {
  hook = fn
}

/** Kancayı çalıştırıp (hata yutulur) sayfayı yeniler */
export async function reloadSafely(): Promise<void> {
  try {
    await hook?.()
  } catch {
    // yoksay - yenileme yine de olsun
  }
  window.location.reload()
}
