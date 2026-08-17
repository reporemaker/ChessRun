/**
 * Cloudflare Access JWT doğrulaması.
 *
 * Access rotanın ÖNÜNDE duruyor, ama yalnızca ona güvenmek yetmez: Worker
 * yanlışlıkla başka bir rotadan ya da `workers.dev` üstünden erişilebilir
 * olursa Access baypas edilir. Bu yüzden Worker her /api isteğinde
 * `Cf-Access-Jwt-Assertion` başlığını kendi de doğruluyor — çift kilit.
 *
 * Yerel geliştirmede (`SKIP_ACCESS=1`) atlanıyor; wrangler dev'de Access yok.
 */

interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

interface AccessPayload {
  aud: string | string[]
  email?: string
  exp: number
  iss: string
}

const keyCache = new Map<string, { keys: CryptoKey[]; at: number }>()
const CACHE_MS = 60 * 60 * 1000

function b64url(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function certsOf(team: string): Promise<CryptoKey[]> {
  const cached = keyCache.get(team)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.keys

  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error('access certs unavailable')
  const { keys } = (await res.json()) as { keys: Jwk[] }
  const imported = await Promise.all(
    keys
      .filter((k) => k.kty === 'RSA')
      .map((k) =>
        crypto.subtle.importKey(
          'jwk',
          { kty: k.kty, n: k.n, e: k.e, alg: 'RS256', ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      ),
  )
  keyCache.set(team, { keys: imported, at: Date.now() })
  return imported
}

/** Geçerliyse e-postayı döndürür, değilse null */
export async function verifyAccess(
  request: Request,
  team: string,
  aud: string,
): Promise<string | null> {
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts

  let payload: AccessPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64url(p))) as AccessPayload
  } catch {
    return null
  }

  const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud
  if (!audOk) return null
  if (payload.exp * 1000 < Date.now()) return null
  if (payload.iss !== `https://${team}.cloudflareaccess.com`) return null

  const data = new TextEncoder().encode(`${h}.${p}`)
  const sig = b64url(s)
  for (const key of await certsOf(team)) {
    if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)) {
      return payload.email ?? 'unknown'
    }
  }
  return null
}
