import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { MAX_ROW_PIECES } from '../engine/config'
import { TUNING_REFERENCE, type DifficultyTuning, setDifficultyTuning } from '../engine/tuning'
import { TUNING_RUN_EVENT, type RunFacts } from '../ui/stats'

/**
 * Zorluk testi paneli - YALNIZCA yerel geliştirmede (App lazy import'u
 * `import.meta.env.DEV` arkasında, modül üretim paketine hiç girmiyor).
 *
 * Üç kaydırıcı dört oyunun yoğunluk eğrisini canlı ayarlar; değişiklik
 * bir sonraki doğan satırdan itibaren geçerli. Kip AÇIKKEN koşular
 * deftere/sıralamaya/rozetlere/istatistiğe yazılmaz; biten her koşunun
 * özeti (süre · tur · puan · o anki ayarlar) panelde listelenir ki
 * ayarları karşılaştırırken not almak kolay olsun.
 */
const STORE_KEY = 'chessrun:tuning'

interface Saved extends DifficultyTuning {
  on: boolean
}

/* Canlı eğriler artık mod bazlı (config.DIFFICULTY); kaydırıcı "referans"
   işaretleri eski ortak eğriyi gösterir - panel dört oyuna tek set uygular */
const DEFAULTS: Saved = {
  on: false,
  step: TUNING_REFERENCE.step,
  base: TUNING_REFERENCE.base,
  inc: TUNING_REFERENCE.inc,
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return DEFAULTS
    const data = JSON.parse(raw) as Partial<Saved>
    return {
      on: Boolean(data.on),
      step: clamp(Number(data.step), 6, 30, DEFAULTS.step),
      base: clamp(Number(data.base), 0.3, 1.2, DEFAULTS.base),
      inc: clamp(Number(data.inc), 0.05, 0.25, DEFAULTS.inc),
    }
  } catch {
    return DEFAULTS
  }
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

interface RunLine {
  facts: RunFacts
  tuning: DifficultyTuning
}

/** Verilen satırda beklenen taş yoğunluğu (Av eğrisi, 8 sütun) */
function densityAt(row: number, t: DifficultyTuning): number {
  return Math.min(MAX_ROW_PIECES, t.base + Math.floor(row / t.step) * t.inc)
}

/** Eğrinin tavana (2.5) dayandığı satır */
function wallRow(t: DifficultyTuning): number {
  return Math.ceil((MAX_ROW_PIECES - t.base) / t.inc) * t.step
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const MODE_LABEL: Record<string, string> = {
  classic: 'Av',
  kingRun: 'Kaçış',
  trio: 'Üçlü',
  daily: 'Günlük',
}

/* Stil bileşen içinde: panel üretim paketine girmediği için App.css temiz kalıyor */
const S: Record<string, CSSProperties> = {
  fab: {
    position: 'fixed',
    left: 10,
    bottom: 10,
    zIndex: 9999,
    font: '600 13px/1 system-ui, sans-serif',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #666',
    background: '#1c1c22',
    color: '#eee',
    cursor: 'pointer',
  },
  panel: {
    position: 'fixed',
    left: 10,
    bottom: 10,
    zIndex: 9999,
    width: 300,
    maxHeight: '80vh',
    overflowY: 'auto',
    font: '13px/1.45 system-ui, sans-serif',
    background: '#1c1c22',
    color: '#eee',
    border: '1px solid #666',
    borderRadius: 10,
    padding: 12,
    boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontWeight: 700, fontSize: 14 },
  row: { margin: '10px 0 2px', display: 'flex', justifyContent: 'space-between' },
  slider: { width: '100%' },
  note: { color: '#aaa', fontSize: 12 },
  on: { color: '#7fdc7f', fontWeight: 700 },
  off: { color: '#aaa' },
  btn: {
    font: 'inherit',
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid #666',
    background: '#2a2a33',
    color: '#eee',
    cursor: 'pointer',
  },
  runs: { marginTop: 10, borderTop: '1px solid #444', paddingTop: 8 },
  runLine: { padding: '4px 0', borderBottom: '1px dotted #333', fontVariantNumeric: 'tabular-nums' },
}

export function TuningPanel() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<Saved>(load)
  const [runs, setRuns] = useState<RunLine[]>([])
  // Olay dinleyicisi güncel ayarları buradan okur (yeniden bağlanmadan)
  const savedRef = useRef(saved)
  savedRef.current = saved

  // Ayarlar motora ve localStorage'a her değişimde işlenir
  useEffect(() => {
    setDifficultyTuning(saved.on ? { step: saved.step, base: saved.base, inc: saved.inc } : null)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved))
    } catch {
      // özel mod - ayar kalıcı olmaz, sorun değil
    }
  }, [saved])

  // Sekme kapanırken de sıfırla (HMR'da eski değer asılı kalmasın)
  useEffect(() => () => setDifficultyTuning(null), [])

  useEffect(() => {
    function onRun(event: Event) {
      const facts = (event as CustomEvent<RunFacts>).detail
      const s = savedRef.current
      setRuns((list) =>
        [{ facts, tuning: { step: s.step, base: s.base, inc: s.inc } }, ...list].slice(0, 8),
      )
    }
    window.addEventListener(TUNING_RUN_EVENT, onRun)
    return () => window.removeEventListener(TUNING_RUN_EVENT, onRun)
  }, [])

  if (!import.meta.env.DEV) return null

  if (!open) {
    return (
      <button type="button" style={S.fab} onClick={() => setOpen(true)}>
        🧪 Zorluk testi {saved.on ? 'AÇIK' : ''}
      </button>
    )
  }

  const t: DifficultyTuning = { step: saved.step, base: saved.base, inc: saved.inc }

  return (
    <div style={S.panel}>
      <div style={S.head}>
        <span style={S.title}>🧪 Zorluk testi</span>
        <span>
          <button type="button" style={S.btn} onClick={() => setSaved({ ...DEFAULTS, on: saved.on })}>
            Sıfırla
          </button>{' '}
          <button type="button" style={S.btn} onClick={() => setOpen(false)}>
            ×
          </button>
        </span>
      </div>

      <label style={{ display: 'block', marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={saved.on}
          onChange={(e) => setSaved({ ...saved, on: e.target.checked })}
        />{' '}
        Test kipi{' '}
        <span style={saved.on ? S.on : S.off}>
          {saved.on ? 'AÇIK - kayıt · sıralama · rozet KAPALI' : 'kapalı - oyun normal'}
        </span>
      </label>

      <div style={S.row}>
        <span>Zorlaşma adımı (satır)</span>
        <b>
          {saved.step} <span style={S.note}>(referans {TUNING_REFERENCE.step})</span>
        </b>
      </div>
      <input
        style={S.slider}
        type="range"
        min={6}
        max={30}
        step={1}
        value={saved.step}
        disabled={!saved.on}
        onChange={(e) => setSaved({ ...saved, step: Number(e.target.value) })}
      />

      <div style={S.row}>
        <span>Başlangıç yoğunluğu</span>
        <b>
          {saved.base.toFixed(2)} <span style={S.note}>(referans {TUNING_REFERENCE.base})</span>
        </b>
      </div>
      <input
        style={S.slider}
        type="range"
        min={0.3}
        max={1.2}
        step={0.05}
        value={saved.base}
        disabled={!saved.on}
        onChange={(e) => setSaved({ ...saved, base: Number(e.target.value) })}
      />

      <div style={S.row}>
        <span>Basamak artışı</span>
        <b>
          {saved.inc.toFixed(2)} <span style={S.note}>(referans {TUNING_REFERENCE.inc})</span>
        </b>
      </div>
      <input
        style={S.slider}
        type="range"
        min={0.05}
        max={0.25}
        step={0.01}
        value={saved.inc}
        disabled={!saved.on}
        onChange={(e) => setSaved({ ...saved, inc: Number(e.target.value) })}
      />

      <p style={S.note}>
        Yoğunluk: 40. satır {densityAt(40, t).toFixed(2)} · 80. satır {densityAt(80, t).toFixed(2)} · 140.
        satır {densityAt(140, t).toFixed(2)} · tavan ({MAX_ROW_PIECES}) {wallRow(t)}. satırda.
        Değişiklik yeni doğan satırlardan itibaren; temiz ölçüm için koşuyu baştan başlat. Günlükte
        aynı düğmeler oran olarak uygulanır.
      </p>

      <div style={S.runs}>
        <b>Son koşular</b>
        {runs.length === 0 && <div style={S.note}>Test kipinde koşu bitince burada listelenir.</div>}
        {runs.map((line, i) => (
          <div key={runs.length - i} style={S.runLine}>
            {MODE_LABEL[line.facts.mode] ?? line.facts.mode} · {fmtDuration(line.facts.durationMs)} ·{' '}
            {line.facts.distance} tur · {line.facts.score} puan
            <br />
            <span style={S.note}>
              adım {line.tuning.step} · taban {line.tuning.base.toFixed(2)} · artış{' '}
              {line.tuning.inc.toFixed(2)} · {line.facts.endReason}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
