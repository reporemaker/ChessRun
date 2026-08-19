import type {
  ProfileData,
  ProfilePutBody,
  ProfileResponse,
  RecoveryFetchBody,
  RecoveryFetchResponse,
  RecoveryPutBody,
} from '@shared/leaderboard'
import { badgeOf, mergeIntoBadges, readBadges, readSelectedBadge, wipeBadges } from './badges'
import { exportSecret, getIdentity, installIdentity, renameIdentity } from './identity'
import { mergeIntoLifetime, readLifetime, wipeLifetime } from './lifetime'
import {
  base64ToBytes,
  bytesToBase64,
  decryptPayload,
  encryptPayload,
  formatCode,
  generateCode,
  lookupOf,
  normalizeCode,
} from './recovery'
import { mergeIntoRuns, runsForProfile, wipeRuns } from './scores'

/**
 * Kalıcılık (Faz 10): kurtarma kodu + sunucu profili.
 *
 * Tarayıcı verisi silinince oyuncunun her şeyi gidiyordu (kimlik, rozetler,
 * defter, sayaçlar) ve sunucuda yepyeni bir oyuncu doğuyordu. İki katman:
 *
 * - Kurtarma kodu: jeton + imza anahtarı, koddan türeyen AES anahtarıyla
 *   şifrelenip sunucuya KÖR blob olarak yazılır (bkz. recovery.ts). Yeni
 *   cihazda kod girilince aynı kimlik geri gelir - ad, sunucu skorları,
 *   birincilikler, sıra.
 * - Profil: rozetler + ömür boyu sayaçlar + defter özeti jeton hash'iyle
 *   sunucuda; kod girince iner, her koşudan sonra çıkar. Ad/rozet
 *   değişikliği de buradan ANINDA sunucuya gider (koşu beklemeden) - "rozetimi
 *   değiştirdim ama tabloda eskisi var" şikâyetinin ikinci yarısı buydu.
 *   Moderatör "başarımları sıfırla" derse `resetAt` dolar ve cihaz yerel
 *   kopyayı da siler.
 *
 * Disiplin leaderboard.ts ile aynı: sunucu yoksa oyun aynen çalışır.
 */
const ENDPOINT = import.meta.env.VITE_LEADERBOARD_URL as string | undefined

export const syncEnabled = Boolean(ENDPOINT)

const RECOVERY_KEY = 'chessrun:recovery'
const RESET_SEEN_KEY = 'chessrun:reset-seen'
/** leaderboard.ts'in yeniden deneme kuyruğu - kimlik değişince ve sıfırlamada boşalır */
const QUEUE_KEY = 'chessrun:lb-queue'
const TIMEOUT_MS = 8000
/** Profil gövdesi için hedef üst sınır (sunucu 48 KB'de kesiyor; pay bırak) */
const PROFILE_TARGET_BYTES = 40_000
/** Yerel ilerleme silinince arayüz tazelensin diye (App dinliyor) */
export const RESET_EVENT = 'chessrun:reset'
/** Ad/rozet/profil sunucuya işlendi - sıralama görünümleri yeniden çeksin */
export const PROFILE_EVENT = 'chessrun:profile'

/* ------------------------------------------------------------------ *
 * Kurtarma kodu
 * ------------------------------------------------------------------ */

/** Bu cihazda üretilmiş/girilmiş kod (biçimlendirilmiş) - ayarlarda gösterilir */
export function readRecoveryCode(): string | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    return raw ? formatCode(raw) : null
  } catch {
    return null
  }
}

function storeRecoveryCode(code: string): void {
  try {
    localStorage.setItem(RECOVERY_KEY, code)
  } catch {
    // yoksay
  }
}

/**
 * Yeni kod üretir, kimliği şifreleyip sunucuya yazar, kodu cihazda saklar.
 * Sunucu yok/ulaşılamıyorsa null. Eski kod (varsa) sunucuda geçersiz olur.
 */
export type CreateResult = { ok: true; code: string } | { ok: false; reason: 'noplayer' | 'offline' }

export async function createRecoveryCode(): Promise<CreateResult> {
  if (!ENDPOINT || typeof crypto === 'undefined' || !crypto.subtle) return { ok: false, reason: 'offline' }
  const identity = getIdentity()
  const code = generateCode()
  try {
    const blob = await encryptPayload(code, {
      v: 1,
      token: identity.token,
      secret: bytesToBase64(exportSecret()),
      name: identity.name,
      createdAt: identity.createdAt,
    })
    const body: RecoveryPutBody = { token: identity.token, lookup: await lookupOf(code), blob }
    const response = await fetch(`${ENDPOINT}/recovery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // 404: sunucu bu jetonu tanımıyor - önce bir koşu sunucuya gitmeli
    if (response.status === 404) return { ok: false, reason: 'noplayer' }
    if (!response.ok) return { ok: false, reason: 'offline' }
    storeRecoveryCode(code)
    return { ok: true, code: formatCode(code) }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

export type RestoreResult = 'ok' | 'invalid' | 'notfound' | 'offline'

/**
 * Kodla kimliği geri getirir: blob'u indirir, çözer, kimliği ve imza
 * anahtarını bu cihaza yazar, profili indirip yerelle BİRLEŞTİRİR (bu
 * cihazdaki birkaç koşu kaybolmasın). Çağıran ardından sayfayı yenilesin -
 * bileşenlerdeki kimlik kopyaları ve bellek önbellekleri tazelensin.
 */
export async function restoreFromCode(input: string): Promise<RestoreResult> {
  if (!ENDPOINT || typeof crypto === 'undefined' || !crypto.subtle) return 'offline'
  const code = normalizeCode(input)
  if (!code) return 'invalid'
  try {
    const body: RecoveryFetchBody = { lookup: await lookupOf(code) }
    const response = await fetch(`${ENDPOINT}/recovery/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 404) return 'notfound'
    if (!response.ok) return 'offline'
    const data = (await response.json()) as RecoveryFetchResponse
    const payload = await decryptPayload(code, data.blob)
    if (!payload) return 'notfound'

    installIdentity(
      { token: payload.token, name: payload.name || getIdentity().name, createdAt: payload.createdAt },
      base64ToBytes(payload.secret),
    )
    // Eski kimliğin bekleyen koşuları yeni jetonla gitmesin (günlük hak
    // atlatma yolu olurdu; skorlar da başkasının adına yazılırdı)
    clearQueue()
    await pullProfile()
    // Kod pull'dan SONRA: sunucuda bekleyen bir sıfırlama varsa applyReset
    // kodu siler; onun ardından yazmak yeni kodu korur.
    storeRecoveryCode(code)
    return 'ok'
  } catch {
    return 'offline'
  }
}

/* ------------------------------------------------------------------ *
 * Profil
 * ------------------------------------------------------------------ */

function selectedBadge(): Pick<ProfilePutBody, 'badge' | 'badgeTier'> {
  const id = readSelectedBadge()
  if (!id) return {}
  const badge = badgeOf(id)
  const idx = readBadges()[id]?.tier ?? 0
  return { badge: id, badgeTier: badge.tiers[Math.min(idx, badge.tiers.length - 1)] }
}

/**
 * Profil gövdesi. Defter özetinden `chain` ve `sig` atılır (yalnızca yerel
 * anlamı var, boyutun yarısı onlar); yine sığmazsa en eski koşular düşer.
 * Sunucu 48 KB üstünü sessizce yazmıyor - o yüzden sınır burada, önceden.
 */
function buildProfile(): ProfileData {
  let runs = runsForProfile().map(({ chain: _chain, sig: _sig, ...rest }) => rest)
  const badges = readBadges()
  const lifetime = readLifetime()
  let data: ProfileData = { badges, lifetime, runs }
  while (runs.length > 10 && JSON.stringify(data).length > PROFILE_TARGET_BYTES) {
    runs = runs.slice(Math.ceil(runs.length / 4))
    data = { badges, lifetime, runs }
  }
  return data
}

function readResetSeen(): number {
  try {
    return Number(localStorage.getItem(RESET_SEEN_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch {
    // yoksay
  }
}

let pushing: Promise<ProfileResponse | null> | null = null
/** Gönderim sürerken gelen istekler: bitince TEK bir güncel gönderim daha */
let followUp: Promise<ProfileResponse | null> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Ad + rozet + (varsayılan) profil verisini sunucuya yazar. Cevapta sunucunun
 * kabul ettiği ad ve red bayrağı - arayüz "bu ad kabul edilmedi" diyebilir.
 * Sunucu yok/ulaşılamıyorsa null.
 *
 * Eşzamanlılık: bir gönderim sürerken gelen çağrılar o gönderimin ESKİ
 * gövdesini paylaşmaz (ad değişikliği kaybolur, NameChip yanlış "reddedildi"
 * gösterirdi); bitince güncel durumla tek bir gönderim daha yapılır ve
 * bekleyenlerin hepsi onun cevabını alır.
 */
export function pushProfile(withData = true): Promise<ProfileResponse | null> {
  if (!ENDPOINT) return Promise.resolve(null)
  if (pushing) {
    if (!followUp) {
      followUp = pushing.then(() => {
        followUp = null
        return pushProfile(true)
      })
    }
    return followUp
  }
  const run = (async (): Promise<ProfileResponse | null> => {
    try {
      const identity = getIdentity()
      const body: ProfilePutBody = { token: identity.token, name: identity.name, ...selectedBadge(), resetSeen: readResetSeen() }
      if (withData) body.data = buildProfile()
      const response = await fetch(`${ENDPOINT}/profile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        keepalive: !withData,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) return null
      const data = (await response.json()) as ProfileResponse
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_EVENT))
      if (applyReset(data)) {
        // Sıfırlama şimdi öğrenildi: yerel silindi, damga alındı - boş
        // profili hemen yaz ki sunucudaki kilit açılsın ve durum netleşsin
        schedulePush(200)
      }
      return data
    } catch {
      return null
    }
  })()
  pushing = run
  void run.finally(() => {
    if (pushing === run) pushing = null
  })
  return run
}

/** Koşu sonu gibi sık anlar için: kısa gecikmeyle tek gönderim */
export function schedulePush(delayMs = 1500): void {
  if (!ENDPOINT) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushProfile()
  }, delayMs)
}

export interface PullResult {
  /** Yerel rozet/sayaç/defter değişti - fişler yeniden okusun */
  changed: boolean
  /** Moderatör sıfırlaması uygulandı */
  reset: boolean
  /** Sunucunun gösterdiği ad (oyuncu sunucuda yoksa null) */
  serverName: string | null
}

/**
 * Sunucu profilini indirir ve yerelle birleştirir. Açılışta bir kez.
 * Sunucuda profil yoksa ama yerelde veri varsa (ilk senkron) yerel çıkar.
 */
export async function pullProfile(): Promise<PullResult> {
  const none: PullResult = { changed: false, reset: false, serverName: null }
  if (!ENDPOINT) return none
  try {
    const response = await fetch(`${ENDPOINT}/profile`, {
      headers: { 'x-chessrun-token': getIdentity().token },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return none
    const data = (await response.json()) as ProfileResponse
    if (applyReset(data)) {
      schedulePush(200)
      return { changed: true, reset: true, serverName: data.name }
    }
    let changed = false
    if (data.data) {
      changed = mergeIntoBadges(data.data.badges) || changed
      changed = mergeIntoLifetime(data.data.lifetime) || changed
      changed = mergeIntoRuns(data.data.runs) || changed
    } else if (runsForProfile().length > 0) {
      schedulePush(500)
    }
    return { changed, reset: false, serverName: data.name }
  } catch {
    return none
  }
}

/**
 * Moderatör sıfırlaması bu cihazda uygulanmalı mı: `resetAt` var, bu cihaz
 * görmemiş VE sıfırlamadan sonra kabul edilmiş bir profil yazımı yok
 * (`updatedAt <= resetAt`). Sonuncusu önemli: sıfırlanmış oyuncu oynamaya
 * devam edip yeni kod oluşturursa, yeni cihazda eski damga bir daha
 * uygulanıp adı/verisi silinmesin. Sunucu tarafı kilit (resetSeen) yazımın
 * damga görülmeden ilerlemesini engelliyor, dolayısıyla `updatedAt > resetAt`
 * "biri sıfırlamayı gördü ve devam etti" demek.
 *
 * Uygulanınca: rozetler, sayaçlar, defter, bekleyen kuyruk silinir; ad
 * rastgeleye döner (sunucudaki eski ad artık reddediliyor); kurtarma kodu
 * düşer (sunucu satırını sildi). Damga saklanır - bir kez.
 */
function applyReset(data: ProfileResponse): boolean {
  if (!data.resetAt) return false
  if (data.resetAt <= readResetSeen()) return false
  if (data.updatedAt != null && data.updatedAt > data.resetAt) {
    // Başkası zaten uyguladı; bu cihaz yalnızca damgayı öğrensin
    rememberReset(data.resetAt)
    return false
  }
  wipeBadges()
  wipeLifetime()
  wipeRuns()
  clearQueue()
  renameIdentity('')
  rememberReset(data.resetAt)
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    // yoksay
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESET_EVENT))
  return true
}

function rememberReset(at: number): void {
  try {
    localStorage.setItem(RESET_SEEN_KEY, String(at))
  } catch {
    // yoksay
  }
}
