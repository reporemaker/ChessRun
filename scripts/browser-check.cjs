/**
 * Tarayıcı denetimi - oyun adresleri, geri düğmesi, kalınan yerden devam.
 *
 * Gerçek Chrome ile (Playwright, kurulu Chrome kanalı; ek tarayıcı indirmez):
 *   cd server && npm run dev          (8787, yerel D1 migrate edilmiş)
 *   npx vite --port 5173              (kökte)
 *   cd /tmp && npm i playwright-core@1.64.1 && BASE=http://localhost:5173 node <bu dosya>
 * 28 adım; ekran görüntüleri dosyanın yanına düşer. CI'ye bağlı değil.
 */
const { chromium } = require('playwright-core')
const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = __dirname
const results = []
function ok(name, cond, extra = '') { results.push({ name, pass: Boolean(cond), extra }); console.log((cond ? '✓ ' : '✗ ') + name + (extra ? '  — ' + extra : '')) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function makeMoves(page, n) {
  for (let i = 0; i < n; i++) {
    const sq = page.locator('.square.movable').first()
    await sq.waitFor({ state: 'visible', timeout: 8000 })
    await sq.click({ force: true })
    await sleep(900) // tur zinciri: kayma/düşman hamlesi bitsin
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

  // --- 1. Adresler ---
  await page.goto(BASE + '/play/classic'); await page.waitForSelector('.gv', { timeout: 10000 })
  ok('1a /play/classic doğrudan oyun', await page.locator('.gv').count() === 1, await page.locator('.gv-mode').first().innerText())
  await page.goto(BASE + '/play/trio'); await page.waitForSelector('.gv')
  ok('1b /play/trio doğrudan oyun', (await page.locator('.gv-mode').first().innerText()).length > 0, await page.locator('.gv-mode').first().innerText())
  await page.goto(BASE + '/PLAY/KingRun/'); await page.waitForSelector('.gv')
  ok('1c /PLAY/KingRun/ toleranslı', (await page.locator('.gv-mode').first().innerText()).length > 0, await page.locator('.gv-mode').first().innerText())
  await page.goto(BASE + '/foo'); await page.waitForSelector('.bi', { timeout: 10000 })
  ok('1d bilinmeyen yol → ana sayfa, adres /', new URL(page.url()).pathname === '/', page.url())
  await page.goto(BASE + '/daily'); await sleep(2500)
  const dailyGv = await page.locator('.gv.daily-gv').count()
  const home = await page.locator('.bi').count()
  ok('1e /daily → günlük (sunucu varsa) ya da ana sayfa', dailyGv === 1 || home === 1, `daily=${dailyGv} home=${home} url=${new URL(page.url()).pathname}`)

  // Ana sayfa → kart → adres push → geri tuşu
  await page.goto(BASE + '/'); await page.waitForSelector('.bi')
  const cards = page.locator('.bi-card:not(.off):not(.today)')
  await cards.first().click(); await page.waitForSelector('.gv')
  const p1 = new URL(page.url()).pathname
  ok('1f karta basınca adres /play/<mod>', /^\/play\/(classic|kingRun|trio)$/.test(p1), p1)
  await page.goBack(); await page.waitForSelector('.bi', { timeout: 8000 })
  ok('1g tarayıcı geri → ana sayfa, adres /', new URL(page.url()).pathname === '/', page.url())
  // Yenileme aynı oyun sayfası
  await page.goto(BASE + '/play/classic'); await page.waitForSelector('.gv')
  await page.reload(); await page.waitForSelector('.gv', { timeout: 10000 })
  ok('1h oyun sayfasında yenileme → aynı oyun sayfası', new URL(page.url()).pathname === '/play/classic' && (await page.locator('.gv').count()) === 1)

  // --- 3. Geri düğmesi (masaüstü + mobil) ---
  await page.goto(BASE + '/play/classic'); await page.waitForSelector('.gv')
  await page.locator('.gv-back').click(); await page.waitForSelector('.bi')
  ok('3a masaüstü «← Menü» (koşu yokken) doğrudan ana sayfa', new URL(page.url()).pathname === '/')
  await page.goto(BASE + '/play/classic'); await page.waitForSelector('.gv')
  await makeMoves(page, 2)
  await page.locator('.gv-back').click()
  const confirmVisible = await page.locator('.gv-leave').isVisible().catch(() => false)
  ok('3b koşu sürerken «← Menü» onay kutusu', confirmVisible)
  await page.screenshot({ path: OUT + '/3b-confirm-desktop.png' })
  await page.locator('.gv-leave button:not(.go)').click()
  ok('3c KAL → oyun devam', await page.locator('.gv').count() === 1 && !(await page.locator('.gv-leave').isVisible().catch(() => false)))
  await page.locator('.gv-back').click(); await page.locator('.gv-leave button.go').click(); await page.waitForSelector('.bi', { timeout: 8000 })
  ok('3d ÇIK → ana sayfa, adres /', new URL(page.url()).pathname === '/')
  // mobil
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const m = await mctx.newPage()
  await m.goto(BASE + '/play/classic'); await m.waitForSelector('.gv')
  const exitVisible = await m.locator('.gv-exit').isVisible()
  ok('3e mobilde sol üst «←» görünür', exitVisible)
  await m.screenshot({ path: OUT + '/3e-mobile-game.png' })
  await makeMoves(m, 2)
  await m.locator('.gv-exit').click()
  ok('3f mobil «←» koşu sürerken onay', await m.locator('.gv-leave').isVisible().catch(() => false))
  await m.screenshot({ path: OUT + '/3f-mobile-confirm.png' })
  await m.locator('.gv-leave button.go').click(); await m.waitForSelector('.bi', { timeout: 8000 })
  ok('3g mobil ÇIK → ana sayfa', new URL(m.url()).pathname === '/')
  await mctx.close()

  // --- 2. Kalınan yerden devam ---
  await page.goto(BASE + '/play/classic'); await page.waitForSelector('.gv')
  await makeMoves(page, 3)
  const scoreBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('chessrun:resume') || 'null'))
  ok('2a koşu sürerken devam fişi yazıldı', scoreBefore && scoreBefore.data && scoreBefore.data.kind === 'game', scoreBefore ? `distance=${scoreBefore.data.game.distance} score=${scoreBefore.data.game.score}` : 'yok')
  await page.reload(); await sleep(1500)
  const promptVisible = await page.locator('#resume-ttl').isVisible().catch(() => false)
  ok('2b yenileme → «koşun yarım kaldı» sorusu', promptVisible)
  await page.screenshot({ path: OUT + '/2b-resume-prompt.png' })
  ok('2c soru açıkken oyun kurulmadı (fiş ezilmedi)', (await page.locator('.gv').count()) === 0)
  await page.locator('.gv-leave button.go').click(); await page.waitForSelector('.gv', { timeout: 8000 })
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('chessrun:resume') || 'null'))
  const distShown = await page.locator('.gv-n').allInnerTexts()
  ok('2d DEVAM ET → oyun kaldığı yerden (fiş mesafe/puan korunmuş)', after && after.data.game.distance === scoreBefore.data.game.distance && after.data.game.score === scoreBefore.data.game.score, `distance=${after && after.data.game.distance} score=${after && after.data.game.score} hud=${distShown.join('/')}`)
  await page.screenshot({ path: OUT + '/2d-resumed.png' })
  await makeMoves(page, 1)
  const after2 = await page.evaluate(() => JSON.parse(localStorage.getItem('chessrun:resume') || 'null'))
  ok('2e devamdan sonra hamle → fiş güncelleniyor', after2 && after2.savedAt > after.savedAt)
  // ana sayfada da sorulur
  await page.goto(BASE + '/'); await sleep(1200)
  ok('2f ana sayfada fiş varsa yine sorulur', await page.locator('#resume-ttl').isVisible().catch(() => false))
  await page.locator('.gv-leave button:not(.go)').click(); await sleep(300)
  const cleared = await page.evaluate(() => localStorage.getItem('chessrun:resume'))
  ok('2g VAZGEÇ → fiş silindi, ana sayfa', cleared === null && (await page.locator('.bi').count()) === 1)
  // başka oyunun adresinde fiş sessizce atılır
  await page.goto(BASE + '/play/trio'); await page.waitForSelector('.gv'); await makeMoves(page, 2)
  await page.goto(BASE + '/play/classic'); await sleep(1200)
  ok('2h başka oyunun adresi: soru yok, fiş atıldı, o oyun açık', !(await page.locator('#resume-ttl').isVisible().catch(() => false)) && (await page.locator('.gv').count()) === 1)
  // çıkış fişi siler (abandon)
  await makeMoves(page, 2)
  await page.locator('.gv-back').click(); await page.locator('.gv-leave button.go').click(); await page.waitForSelector('.bi')
  ok('2i çıkış (abandon) → fiş silindi', (await page.evaluate(() => localStorage.getItem('chessrun:resume'))) === null)
  // defterde kayıt: çıkış abandon → son satır bu koşu (RunRecord bitiş sebebi taşımaz; skor/mod eşleşir)
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem('chessrun:runs') || '[]'))
  const lastRun = runs[runs.length - 1]
  ok('2j çıkışta koşu deftere yazıldı (abandon)', lastRun && lastRun.mode === 'classic' && lastRun.score > 0 && Date.now() - Date.parse(lastRun.at) < 20000, lastRun ? `mode=${lastRun.mode} score=${lastRun.score} at=${lastRun.at}` : 'kayıt yok')

  // --- günlük devam (sunucu varsa) ---
  await page.goto(BASE + '/daily'); await sleep(2500)
  if (await page.locator('.gv.daily-gv').count()) {
    const ready = page.locator('.outro-btn.primary').first()
    if (await ready.count()) { await ready.click() }
    // Hamle yapma (rastgele kare vuruşa basabilir); tahta kendisi kayar, mesafe artınca fiş yazılır
    let dt = null
    for (let i = 0; i < 40 && !dt; i++) { await sleep(400); dt = await page.evaluate(() => JSON.parse(localStorage.getItem('chessrun:resume') || 'null')) }
    ok('2k günlük: fiş yazıldı', dt && dt.data.kind === 'daily', dt ? `distance=${dt.data.game.distance}` : 'yok')
    if (dt) {
      await page.reload(); await sleep(1500)
      ok('2l günlük yenileme → devam sorusu', await page.locator('#resume-ttl').isVisible().catch(() => false))
      await page.locator('.gv-leave button.go').click(); await sleep(1500)
      ok('2m günlük DEVAM → oyun ekranında, hazır penceresi yok', (await page.locator('.gv.daily-gv').count()) === 1 && (await page.locator('.outro-btn.primary').count()) === 0)
      await page.screenshot({ path: OUT + '/2m-daily-resumed.png' })
    }
  } else {
    console.log('(günlük: sunucu yok, atlandı)')
  }

  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} geçti`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => { console.error('HATA', e); process.exit(2) })
