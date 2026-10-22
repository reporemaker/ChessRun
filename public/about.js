// Hakkında dil seçimi. CSP script-src 'self': satır içi betik yok.
// Sıra: ?l= parametresi > oyunun kayıtlı ayarı (chessrun:settings) >
// tarayıcı dili > İngilizce. Düğme seçimi adres çubuğuna ?l= yazar ki
// bağlantı paylaşılabilsin.
(() => {
  // Tahta: oyunda seçilen görünüm (varsayılan bakır)
  try {
    const s = JSON.parse(localStorage.getItem('chessrun:settings') || '{}')
    document.documentElement.dataset.board = s && s.board === 'classic' ? 'classic' : 'vintage'
  } catch {
    document.documentElement.dataset.board = 'vintage'
  }

  const LANGS = ['de', 'en', 'es', 'fr', 'tr']
  const TITLES = {
    de: 'Über · ChessRun',
    en: 'About · ChessRun',
    es: 'Acerca de · ChessRun',
    fr: 'À propos · ChessRun',
    tr: 'Hakkında · ChessRun',
  }

  function fromUrl() {
    const l = new URLSearchParams(location.search).get('l')
    return LANGS.includes(l) ? l : null
  }

  function stored() {
    try {
      const s = JSON.parse(localStorage.getItem('chessrun:settings') || '{}')
      return LANGS.includes(s.lang) ? s.lang : null
    } catch {
      return null
    }
  }

  function detect() {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const code = (tag || '').slice(0, 2).toLowerCase()
      if (LANGS.includes(code)) return code
    }
    return 'en'
  }

  function apply(code) {
    document.documentElement.lang = code
    document.title = TITLES[code]
    document.querySelectorAll('[data-lang]').forEach((el) => {
      el.hidden = el.getAttribute('data-lang') !== code
    })
    document.querySelectorAll('.lang-pick button').forEach((b) => {
      b.classList.toggle('on', b.dataset.pick === code)
    })
  }

  apply(fromUrl() ?? stored() ?? detect())
  document.querySelectorAll('.lang-pick button').forEach((b) => {
    b.addEventListener('click', () => {
      apply(b.dataset.pick)
      try {
        const url = new URL(location.href)
        url.searchParams.set('l', b.dataset.pick)
        history.replaceState(null, '', url)
      } catch {
        // adres güncellenemedi; seçim yine de uygulandı
      }
    })
  })
})()
