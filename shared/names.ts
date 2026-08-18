/**
 * Ad filtresi - istemci ve sunucu aynı işlevi çalıştırıyor.
 *
 * Amaç mükemmel süzgeç değil, ucuz süzgeç: bariz küfrü ve hakareti daha
 * yazılırken çeviriyor, kalanı paneldeki "Adlar" sayfası (sıfırla · gizle ·
 * yasakla) topluyor. Liste burada kısa ve kök hâlinde; sunucudaki D1
 * listesi panelden büyütülüyor ve bununla birleştiriliyor.
 *
 * Eşleşme kuralı yanlış pozitife karşı ayarlı: kısa kökler (< 6 harf)
 * yalnızca kelime başında eşleşiyor ("puta" → "computadora"ya takılmıyor),
 * uzun kökler her yerde.
 */

const L33T: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '€': 'e',
  '!': 'i',
  '|': 'i',
}

/** Küçük harf, aksansız, l33t çözülmüş, yalnızca harf-rakam; kelimeler korunur */
export function normalizeName(raw: string): string[] {
  const folded = raw
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[0134578@$€!|]/g, (c) => L33T[c] ?? c)
  return folded
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.replace(/(.)\1{2,}/g, '$1'))
    .filter(Boolean)
}

/** Kök liste - beş dil, yalnızca bariz olanlar. Panelden genişletilir. */
export const BASE_BANNED: readonly string[] = [
  // tr
  'orospu', 'sikt', 'sikerim', 'sikik', 'pezevenk', 'yarrak', 'amcik', 'gotveren', 'ibne', 'kahpe', 'sürtük',
  // en
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'asshole', 'pussy', 'retard', 'slut',
  // de
  'hurensohn', 'fotze', 'arschloch', 'wichser', 'schwuchtel', 'nutte', 'ficken', 'schlampe',
  // es
  'puta', 'puto', 'mierda', 'cabron', 'pendejo', 'maricon', 'joder', 'gilipollas',
  // fr
  'putain', 'pute', 'salope', 'connard', 'connasse', 'encule', 'merde', 'nique', 'salaud',
  // ortak
  'hitler',
]

const BASE_NORMALIZED = BASE_BANNED.map((w) => normalizeName(w).join(''))

/**
 * Ad yasaklı kök içeriyor mu. `extra` sunucudaki D1 listesi (ham hâliyle;
 * burada normalize ediliyor).
 */
export function hasBannedWord(name: string, extra: readonly string[] = []): boolean {
  const tokens = normalizeName(name)
  if (tokens.length === 0) return false
  const joined = tokens.join('')
  // Kelime başlangıç konumları: kısa kök yalnızca buralardan başlayabilir.
  // Böylece "f.u.c.k" (dört tek harfli kelime) yakalanıyor ama
  // "computadora"nın ortasındaki "puta" yakalanmıyor.
  const starts: number[] = []
  for (let i = 0, at = 0; i < tokens.length; i++) {
    starts.push(at)
    at += tokens[i].length
  }
  const roots = extra.length ? [...BASE_NORMALIZED, ...extra.map((w) => normalizeName(w).join(''))] : BASE_NORMALIZED
  for (const root of roots) {
    if (!root) continue
    if (root.length >= 6) {
      if (joined.includes(root)) return true
    } else if (starts.some((at) => joined.startsWith(root, at))) {
      return true
    }
  }
  return false
}
