import { type StringKey, translate } from './i18n'
import { useSettings } from './settings'

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string

/** Seçili dile bağlı çeviri fonksiyonu - dil değişince bileşen yeniden çiziliyor */
export function useT(): Translate {
  const { lang } = useSettings()
  return (key, vars) => translate(lang, key, vars)
}
