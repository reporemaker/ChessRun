import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Yalnızca geliştirme: rozet.html'deki tıklamalı seçimleri nogit/ altındaki
 * rozet-secim.json'a yazar. Üretim derlemesine girmez (configureServer
 * sadece dev sunucusunda çalışır). Tasarım kararlarını tarayıcıdan
 * dosyaya taşımanın en kısa yolu.
 */
function devPickSink(): Plugin {
  return {
    name: 'chessrun-dev-pick-sink',
    configureServer(server) {
      server.middlewares.use('/__pick', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => (body += chunk))
        req.on('end', () => {
          try {
            const file = fileURLToPath(new URL('./nogit/rozet-secim.json', import.meta.url))
            // Birleştir, ezme: başka bir sekmeden ya da elle yapılan bir istek
            // önceki seçimleri silmesin. Bir rozeti kaldırmak için istemci
            // değerini null gönderir.
            let current: Record<string, unknown> = {}
            try {
              current = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
            } catch {
              current = {}
            }
            const incoming = JSON.parse(body) as Record<string, unknown>
            for (const [k, v] of Object.entries(incoming)) {
              if (v === null) delete current[k]
              else current[k] = v
            }
            writeFileSync(file, JSON.stringify(current, null, 2))
            res.statusCode = 204
          } catch {
            res.statusCode = 400
          }
          res.end()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devPickSink()],
  server: {
    /* Üretimde toplama ucu APEX'te, yani oyunla AYNI ORIGIN — CORS diye
       bir şey yok ve `sendBeacon` sorunsuz çalışıyor (beacon preflight
       yapamaz, çapraz origin'de oturum olayları iOS'ta sessizce kaybolur).
       Yerelde vite 5173, Worker 8787'de; proxy olmasa geliştirme ortamı
       üretimden farklı davranır ve CORS'u Worker'a eklemek zorunda
       kalırdık — üretimin hiç ihtiyaç duymadığı bir kod.
       Bu yüzden yerelde de aynı origin: VITE_STATS_URL=/collect */
    proxy: {
      '/collect': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/lb': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  resolve: {
    // tsconfig.app.json'daki @shared/* takma adının çalışma zamanı karşılığı.
    // shared/ oyun, Worker ve panel arasındaki tek ortak sözleşme.
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
})
