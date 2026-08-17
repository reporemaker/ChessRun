/**
 * Beş dil, tek düz sözlük.
 *
 * Anahtarlar noktalı ve düz (`home.streak`) — iç içe nesne yerine düz tablo,
 * çünkü eksik çeviri **anahtar bazında** önce İngilizceye, sonra Türkçeye
 * düşüyor; ham anahtar hiçbir koşulda ekrana çıkmıyor. Beş dil de şu an tam,
 * ama yedek mekanizması duruyor: yeni bir anahtar bir dilde unutulursa oyun
 * kırılmıyor, ayarlar penceresi de eksiği okuyucuya söylüyor.
 */

export const LANGS = [
  { code: 'tr', label: 'TR', name: 'Türkçe', locale: 'tr-TR' },
  { code: 'en', label: 'EN', name: 'English', locale: 'en-US' },
  { code: 'de', label: 'DE', name: 'Deutsch', locale: 'de-DE' },
  { code: 'es', label: 'ES', name: 'Español', locale: 'es-ES' },
  { code: 'fr', label: 'FR', name: 'Français', locale: 'fr-FR' },
] as const

export type Lang = (typeof LANGS)[number]['code']

export const DEFAULT_LANG: Lang = 'tr'

export function isLang(value: unknown): value is Lang {
  return LANGS.some((entry) => entry.code === value)
}

export function localeOf(lang: Lang): string {
  return LANGS.find((entry) => entry.code === lang)?.locale ?? 'tr-TR'
}

/* ------------------------------------------------------------------ *
 * TR — referans sözlük. Anahtar kümesini bu tanımlıyor.
 * ------------------------------------------------------------------ */

const tr = {
  /* --- ortak --- */
  'app.name': 'ChessRun',
  'common.back': 'Geri',
  'common.close': 'Kapat',
  'common.soon': 'YAKINDA',

  /* --- modlar --- */
  'mode.classic.name': 'Av',
  'mode.classic.line': 'Yediğin taşa dönüşürsün. Rakip şahı avla.',
  'mode.kingRun.name': 'Kaçış',
  'mode.kingRun.line': 'Şah sensin. Vurulan kareye giremezsin.',
  'mode.trio.name': 'Üçlü',
  'mode.trio.line': 'Vezir, kale ve fil. Üçünü de ayakta tut.',
  'mode.trio.motto': 'Hepsi bir için',

  /* --- ana sayfa --- */
  'home.streak': 'SERİ {n} GÜN',
  'home.noStreak': 'SERİ YOK',
  'home.hi': 'HI',
  'home.rank': 'SIRA',
  'home.rankPending': 'SUNUCU BEKLEMEDE',
  'home.settings': 'AYARLAR',
  'home.daily': 'BUGÜNÜN OYUNU',
  'home.dailyMeta': 'TOHUM #{seed} · YENİLENME {clock}',
  'home.best': 'EN İYİN',
  'home.free': 'SERBEST',
  'home.games': '{n} OYUN',
  'home.foot': 'BUGÜN HERKES AYNI TAHTADA',

  /* --- ayarlar --- */
  'settings.title': 'AYARLAR',
  'settings.pieceColor': 'TAŞ RENGİ',
  'settings.pieceColorHint': 'sadece görünüm',
  'settings.white': 'BEYAZ',
  'settings.black': 'SİYAH',
  'settings.sound': 'SES',
  'settings.soundOn': 'AÇIK',
  'settings.soundOff': 'KAPALI',
  'settings.soundHint': '8-bit efektler',
  'settings.corridor': 'KORİDOR',
  'settings.corridorHint': 'serbest oyunlarda',
  'corridor.narrow': 'DAR',
  'corridor.medium': 'ORTA',
  'corridor.wide': 'GENİŞ',
  'corridor.cols': '{n} sütun',
  'settings.lang': 'DİL',
  'settings.langPicked': 'Seçili: {name}',
  'settings.ranking': 'SIRALAMA',
  'settings.rankMine': 'SIRAN',
  'settings.scoreMine': 'SKORUN',
  'settings.players': 'OYUNCU',
  'settings.openFull': 'TÜM LİSTE İÇİN DOKUN',
  'settings.closeFull': 'LİSTEYİ KAPAT',
  'settings.serverPending': 'SUNUCU BEKLEMEDE',
  'settings.listAllTime': 'TÜM ZAMANLAR',
  'settings.listWeek': 'BU HAFTA',
  'settings.you': 'SEN',
  'settings.empty': 'HENÜZ KOŞU YOK',
  'settings.info': 'BİLGİ',
  'settings.howTo': 'NASIL OYNANIR',
  'settings.about': 'HAKKINDA',
  'settings.badgesSoon': 'ROZETLER YAKINDA',
  'settings.langPartial':
    'Uzun metinler ve oyun içi yazılar bu dilde henüz yok, İngilizce gösterilir.',

  /* --- sayfa: nasıl oynanır --- */
  'help.title': 'NASIL OYNANIR',
  'help.core.title': 'ÜÇ OYUNUN ORTAK KURALI',
  'help.core.1':
    'Her hamlenden sonra tahta bir satır kayar: üstten yeni satır gelir, en alttaki silinir. Alt satırda kalırsan düşersin.',
  'help.core.2':
    'Pas yok. Her turda bir hamle oynamak zorundasın — beklemek bir seçenek değil.',
  'help.core.3':
    'Hamlen kalmazsa sıkışırsın: tahta yeniden dizilir, puanın kalır, +5 puan alırsın. Bu hak koşu başına iki kez geçerli; üçüncüsünde koşu biter.',
  'help.core.4':
    'Hayatta kaldığın her satır 1 puan. Üç mod da bu tabanı paylaşıyor, üstüne kendi puanını ekliyor.',
  'help.core.5':
    'Günün oyunu herkeste aynı tohumu kullanır: aynı gün, aynı taşlar, aynı yerler. Serbest oyunlar rastgeledir.',
  'help.classic.1': 'Tek bir atla başlarsın.',
  'help.classic.2':
    'Yediğin taşa dönüşürsün — bu iyi de olabilir kötü de. Vezirken piyon yersen piyona düşersin.',
  'help.classic.3':
    'Rakip şaha şah çekersen rakip sadece şahını kurtaran hamleyi oynar; kurtaracak hamle yoksa başka bir taşını oynar. Üst üste şah çektikçe puan katlanır.',
  'help.classic.4':
    'Rakip şahı yersen puan ve can kazanırsın, tahta baştan kurulur — kazandığın canı hemen kaybetmeyesin diye.',
  'help.kingRun.1': 'Şah sensin. Dönüşüm yok, tek canın var.',
  'help.kingRun.2':
    'Vurulan kareye giremezsin — gerçek satranç kuralı. Korunmasız taşı yersin, korunanı yiyemezsin.',
  'help.kingRun.3':
    'Şah turda bir kare gider, tahta bir satır kayar: hayatta kalmak için her tur yukarı basmalısın.',
  'help.kingRun.4': 'Gidecek güvenli kare kalmazsa mat olursun ve koşu biter.',
  'help.trio.1': 'Vezir, kale ve fil senin. Her tur bunlardan yalnızca birini oynarsın.',
  'help.trio.2':
    'Tahta yine her hamlede kayar; oynamadığın iki taş bir satır aşağı düşer. Üçünü birden ayakta tutmak asıl mesele.',
  'help.trio.3':
    'Puan mesafeden ve tehditten gelir: rakip taşını tehdit altına almak puan kazandırır, mat etmek büyük ikramiye.',
  'help.trio.4':
    'Bir taşını kaybedersen koşu bitmez, ama rakip şahı yersen eksik taşın geri gelir; kadron tamsa dördüncü taş katılır.',

  /* --- sayfa: hakkında --- */
  'about.title': 'HAKKINDA',
  'about.what.title': 'BU NE',
  'about.what.1':
    'ChessRun sonsuz koşu ile satrancı birleştiriyor: tahta her hamlede kayıyor, gerçek satranç hamleleriyle hayatta kalmaya çalışıyorsun.',
  'about.what.2':
    'Üç mod aynı motoru paylaşıyor. Motor React bilmiyor, oyunun tüm kuralları saf fonksiyonlarda yaşıyor ve testlerle korunuyor.',
  'about.scores.title': 'SKORLAR VE GİZLİLİK',
  'about.scores.1':
    'Hesap yok, e-posta yok, parola yok. Tarayıcın ilk açılışta kendine bir cihaz jetonu üretiyor; skorların bu jetonla imzalanıyor.',
  'about.scores.2':
    'Skorların şu an yalnızca bu cihazda, tarayıcının yerel deposunda duruyor. Depoyu silersen skorlar da gider.',
  'about.scores.3':
    'Sıralama sunucusu henüz bağlı değil. Bağlandığında aynı imzalı kayıtlar gönderilecek; toplanan tek şey skor, mod ve cihaz jetonu olacak.',
  'about.tech.title': 'TEKNİK',
  'about.tech.1':
    'Ses dosyası yok: bütün efektler WebAudio osilatörüyle anlık üretiliyor. Görsel de aynı dili konuşuyor — 8-bit, sert zarflar, kare dalga.',
  'about.tech.2':
    'Günlük tohum tarihten üretiliyor, rastgelelik tohumlanmış bir üreteçten geliyor: aynı tohum her cihazda aynı tahtayı kuruyor.',
  'about.device': 'CİHAZ',
  'about.version': 'SÜRÜM',

  /* --- oyun ekranı --- */
  'game.menu': 'Menü',
  'game.daily': 'günlük',
  'game.share': 'Sonucu paylaş',
  'game.shareCopied': 'Panoya kopyalandı ✓',
  'game.shareDone': 'Paylaşıldı ✓',
  'game.stuck': 'SIKIŞTIN',
  'game.stuckSub': 'tahta yeniden diziliyor · +{n}',
  'game.record': 'YENİ REKOR!',
  'game.weekRecord': 'HAFTANIN EN İYİSİ!',
  'game.mated': 'Mat oldun',
  'game.over': 'Oyun bitti',
  'game.scoreLine': 'puan · {n} satır',
  'game.yourRecord': 'Rekorun',
  'game.thisWeek': 'Bu hafta',
  'game.again': 'Tekrar oyna',
  'game.toMenu': 'Menüye dön',
  'game.tipClose': 'İpucunu kapat',

  'hint.threat': 'Tehdit altındasın — güvenli bir kareye geçmelisin.',
  'hint.check': 'Şah! Rakip bu turda sadece şahını kurtarabilir.',
  'hint.kingRun': 'Her tur yukarı basmazsan bir satır dibe düşersin.',

  'phase.playerMove': 'Hamlen oynanıyor…',
  'phase.boardOut': 'Şah düştü — tahta dağılıyor…',
  'phase.boardIn': 'Yeni tahta kuruluyor…',
  'phase.stuckOut': 'Sıkıştın — taşlar karılıyor…',
  'phase.stuckIn': 'Yeni dizilim geliyor…',
  'phase.scroll': 'Yeni satır geliyor…',
  'phase.enemyMove': 'Rakip oynuyor…',

  'flash.kingBonus': 'ŞAH ALINDI! +{points} puan, +{lives} can',
  'flash.capture': '{piece} +{points}',
  'flash.transform': '→ {piece} oldun',
  'flash.check': 'ŞAH! +{points}',
  'flash.checkStreak': 'ŞAH ×{streak} +{points}',
  'flash.mate': 'MAT! +{points}',
  'flash.checkmated': 'MAT OLDUN',
  'flash.refresh': 'Tahta yenilendi',
  'flash.lifeCaptured': 'Yenildin! −1 can',
  'flash.lifeFell': 'Tahtadan düştün! −1 can',
  'flash.pieceCaptured': '{piece} yendi! {left} taş kaldı',
  'flash.pieceFell': '{piece} düştü! {left} taş kaldı',
  'flash.squadGain': '{piece} kadroya katıldı!',
  'flash.threat': 'TEHDİT ×{count} +{points}',

  'hud.score': 'Puan',
  'hud.distance': 'Mesafe',
  'hud.level': 'Seviye',
  'hud.lives': 'Can',
  'hud.check': 'ŞAH',
  'hud.threat': 'TEHDİT',
  'hud.moves': 'hamle',
  'hud.safeMoves': 'güvenli hamle',
  'game.badges': 'ROZETLER',
  'hud.stuck': 'SIKIŞMA',
  'hud.pieces': 'Taş',
  'hud.falling': 'dipte — bu tur oynanmazsa düşer',
  'hud.speed': 'Hız',
  'hud.sound': 'Ses',

  'speed.slow': 'Yavaş',
  'speed.normal': 'Normal',
  'speed.fast': 'Hızlı',

  'piece.p': 'Piyon',
  'piece.n': 'At',
  'piece.b': 'Fil',
  'piece.r': 'Kale',
  'piece.q': 'Vezir',
  'piece.k': 'Şah',

  'outro.over': 'OYUN BİTTİ',
  'outro.mated': 'MAT OLDUN',
  'outro.record': 'YENİ REKOR',
  'outro.best': 'EN İYİLER',
  'outro.rank': 'SIRAN #{n}',
  'outro.skip': 'dokun · geç',
  'outro.rows': '{n}s',

  'tip.start': 'Yeşil halkalı taş sensin. Gitmek istediğin kareye dokun.',
  'tip.transform': 'Yediğin taşa dönüştün — artık onun gibi hareket ediyorsun.',
  'tip.check':
    'Şah çektin! Rakip bu tur sadece şahını kurtarabilir. Üst üste çek, puan katlanır.',
  'tip.edge': 'Alt satırda kalma: tahta kayınca dışarı düşersin.',
  'tip.stuck':
    'Hamlen kalmadı — bir sıkışma hakkın yandı, tahta yeniden dizildi. Hakkın bitince sıkışmak koşuyu bitirir.',
  'tip.king': 'Rakip şah tahtanın en değerli hedefi: +25 puan, +1 can ve yepyeni bir tahta.',

  'share.rowsSurvived': '{n} satır dayandı',
  'share.mated': 'mat oldu',
  'share.points': '{n} puan',
  'share.rows': '{n} satır',
  'share.streak': '🔥 {n} gün',
  /* --- Rozetler: ad + koşul. Gizli rozetlerde koşul kazanılana kadar
     arayüzde saklanıyor, metin yine de burada duruyor. --- */
  'badge.transform': 'Dönüşüm',
  'badge.transform.how': 'Yediğin taşa dönüş',
  'badge.downgrade': 'Düşüş',
  'badge.downgrade.how': 'Vezir ya da kaleyken piyona düş',
  'badge.chain': 'Zincir',
  'badge.chain.how': 'Üst üste 3 şah çek',
  'badge.throne': 'Taht',
  'badge.throne.how': 'Rakip şahı ye',
  'badge.breath': 'Nefes',
  'badge.breath.how': 'Sıkışma hakkını kullan',
  'badge.hunter': 'Avcı',
  'badge.hunter.how': "Av'da tek koşuda 2 şah ye",
  'badge.fugitive': 'Kaçak',
  'badge.fugitive.how': "Kaçış'ta 30 satır dayan",
  'badge.squad': 'Kadro',
  'badge.squad.how': "Üçlü'de taş kaybetmeden 20 satır git",
  'badge.mate': 'Mat',
  'badge.mate.how': 'Rakibi mat et',
  'badge.sevenDays': 'Yedi gün',
  'badge.sevenDays.how': 'Gün serisini 7 yap',
  'badge.allModes': 'Üç oyun',
  'badge.allModes.how': 'Üç modu da oyna',
  'badge.narrow': 'Dar koridor',
  'badge.narrow.how': 'Dar koridorda 15 satır git',
} satisfies Record<string, string>

export type StringKey = keyof typeof tr

type Partial7 = Partial<Record<StringKey, string>>

/* ------------------------------------------------------------------ *
 * EN — tam. Diğer diller eksik anahtarlarda buraya düşüyor.
 * ------------------------------------------------------------------ */

const en: Partial7 = {
  'common.back': 'Back',
  'common.close': 'Close',
  'common.soon': 'SOON',

  'mode.classic.name': 'Hunt',
  'mode.classic.line': 'You become what you capture. Hunt the enemy king.',
  'mode.kingRun.name': 'Escape',
  'mode.kingRun.line': "You are the king. You can't step onto an attacked square.",
  'mode.trio.name': 'Trio',
  'mode.trio.line': 'Queen, rook and bishop. Keep all three alive.',
  'mode.trio.motto': 'All for one',

  'home.streak': '{n} DAY STREAK',
  'home.noStreak': 'NO STREAK',
  'home.rank': 'RANK',
  'home.rankPending': 'SERVER PENDING',
  'home.settings': 'SETTINGS',
  'home.daily': "TODAY'S GAME",
  'home.dailyMeta': 'SEED #{seed} · RESETS IN {clock}',
  'home.best': 'YOUR BEST',
  'home.free': 'FREE PLAY',
  'home.games': '{n} GAMES',
  'home.foot': 'EVERYONE PLAYS THE SAME BOARD TODAY',

  'settings.title': 'SETTINGS',
  'settings.pieceColor': 'PIECE COLOUR',
  'settings.pieceColorHint': 'looks only',
  'settings.white': 'WHITE',
  'settings.black': 'BLACK',
  'settings.sound': 'SOUND',
  'settings.soundOn': 'ON',
  'settings.soundOff': 'OFF',
  'settings.soundHint': '8-bit effects',
  'settings.corridor': 'CORRIDOR',
  'settings.corridorHint': 'free play only',
  'corridor.narrow': 'NARROW',
  'corridor.medium': 'MEDIUM',
  'corridor.wide': 'WIDE',
  'corridor.cols': '{n} columns',
  'settings.lang': 'LANGUAGE',
  'settings.langPicked': 'Selected: {name}',
  'settings.ranking': 'RANKING',
  'settings.rankMine': 'YOUR RANK',
  'settings.scoreMine': 'YOUR SCORE',
  'settings.players': 'PLAYERS',
  'settings.openFull': 'TAP FOR THE FULL LIST',
  'settings.closeFull': 'CLOSE THE LIST',
  'settings.serverPending': 'SERVER PENDING',
  'settings.listAllTime': 'ALL TIME',
  'settings.listWeek': 'THIS WEEK',
  'settings.you': 'YOU',
  'settings.empty': 'NO RUNS YET',
  'settings.info': 'INFO',
  'settings.howTo': 'HOW TO PLAY',
  'settings.about': 'ABOUT',
  'settings.badgesSoon': 'BADGES COMING',
  'settings.langPartial':
    'Long-form pages and in-game text are not translated yet — showing English.',

  'help.title': 'HOW TO PLAY',
  'help.core.title': 'RULES ALL THREE MODES SHARE',
  'help.core.1':
    'After every move the board scrolls one row: a new row arrives on top, the bottom one is deleted. Stay on the bottom row and you fall off.',
  'help.core.2': 'No passing. You must move every turn — waiting is not an option.',
  'help.core.3':
    'If you run out of moves you get stuck: the board is rebuilt, your score stays, and you gain +5. You get this twice per run; the third time ends it.',
  'help.core.4':
    'Every row you survive is 1 point. All three modes share this base and add their own scoring on top.',
  'help.core.5':
    "Today's game uses one seed for everybody: same day, same pieces, same squares. Free games are random.",
  'help.classic.1': 'You start as a single knight.',
  'help.classic.2':
    'You become the piece you capture — which can be good or bad. Take a pawn while you are a queen and you drop to a pawn.',
  'help.classic.3':
    'Give check and the enemy may only play a move that saves its king; if none exists it moves another piece instead. Consecutive checks multiply the reward.',
  'help.classic.4':
    'Capture the enemy king for points and an extra life, and the board is rebuilt — so the life you just won is not taken straight back.',
  'help.kingRun.1': 'You are the king. No transformation, a single life.',
  'help.kingRun.2':
    "You cannot step onto an attacked square — the real chess rule. You can take an undefended piece, never a defended one.",
  'help.kingRun.3':
    'The king moves one square per turn and the board scrolls one row: to survive you have to climb every single turn.',
  'help.kingRun.4': 'With no safe square left you are mated and the run ends.',
  'help.trio.1': 'Queen, rook and bishop are yours. Each turn you move exactly one of them.',
  'help.trio.2':
    'The board still scrolls on every move, so the two pieces you did not move fall one row. Keeping all three alive is the real problem.',
  'help.trio.3':
    'Points come from distance and from pressure: threatening an enemy piece scores, and mating is the jackpot.',
  'help.trio.4':
    'Losing a piece does not end the run, and capturing the enemy king brings a lost piece back — with a full roster it adds a fourth.',

  'about.title': 'ABOUT',
  'about.what.title': 'WHAT THIS IS',
  'about.what.1':
    'ChessRun crosses an endless runner with chess: the board scrolls on every move and you survive using real chess moves.',
  'about.what.2':
    'The three modes share one engine. That engine knows nothing about React — every rule lives in pure functions covered by tests.',
  'about.scores.title': 'SCORES AND PRIVACY',
  'about.scores.1':
    'No account, no email, no password. Your browser generates a device token on first run and your scores are signed with it.',
  'about.scores.2':
    "Your scores currently live only on this device, in the browser's local storage. Clear it and they are gone.",
  'about.scores.3':
    'The ranking server is not connected yet. When it is, the same signed records are sent; the only things collected are score, mode and device token.',
  'about.tech.title': 'TECHNICAL',
  'about.tech.1':
    'There are no audio files: every effect is generated live with a WebAudio oscillator. The visuals speak the same language — 8-bit, hard envelopes, square waves.',
  'about.tech.2':
    'The daily seed is derived from the date and all randomness comes from a seeded generator: the same seed builds the same board on every device.',
  'about.device': 'DEVICE',
  'about.version': 'VERSION',

  'game.menu': 'Menu',
  'game.daily': 'daily',
  'game.share': 'Share result',
  'game.shareCopied': 'Copied to clipboard ✓',
  'game.shareDone': 'Shared ✓',
  'game.stuck': 'STUCK',
  'game.stuckSub': 'rebuilding the board · +{n}',
  'game.record': 'NEW RECORD!',
  'game.weekRecord': 'BEST OF THE WEEK!',
  'game.mated': 'Checkmated',
  'game.over': 'Game over',
  'game.scoreLine': 'points · {n} rows',
  'game.yourRecord': 'Your record',
  'game.thisWeek': 'This week',
  'game.again': 'Play again',
  'game.toMenu': 'Back to menu',
  'game.tipClose': 'Dismiss tip',

  'hint.threat': 'You are under attack — move to a safe square.',
  'hint.check': 'Check! This turn the enemy can only save its king.',
  'hint.kingRun': 'Climb every turn or you drop one row towards the edge.',

  'phase.playerMove': 'Playing your move…',
  'phase.boardOut': 'King down — the board is falling apart…',
  'phase.boardIn': 'Building a new board…',
  'phase.stuckOut': 'Stuck — shuffling the pieces…',
  'phase.stuckIn': 'New arrangement incoming…',
  'phase.scroll': 'A new row is arriving…',
  'phase.enemyMove': 'Enemy is moving…',

  'flash.kingBonus': 'KING TAKEN! +{points} points, +{lives} life',
  'flash.capture': '{piece} +{points}',
  'flash.transform': '→ you are now a {piece}',
  'flash.check': 'CHECK! +{points}',
  'flash.checkStreak': 'CHECK ×{streak} +{points}',
  'flash.mate': 'MATE! +{points}',
  'flash.checkmated': 'CHECKMATED',
  'flash.refresh': 'Board rebuilt',
  'flash.lifeCaptured': 'Captured! −1 life',
  'flash.lifeFell': 'Fell off the board! −1 life',
  'flash.pieceCaptured': '{piece} captured! {left} left',
  'flash.pieceFell': '{piece} fell off! {left} left',
  'flash.squadGain': '{piece} joins the squad!',
  'flash.threat': 'THREAT ×{count} +{points}',

  'hud.score': 'Score',
  'hud.distance': 'Distance',
  'hud.level': 'Level',
  'hud.lives': 'Lives',
  'hud.check': 'CHECK',
  'hud.threat': 'THREAT',
  'hud.moves': 'moves',
  'hud.safeMoves': 'safe moves',
  'game.badges': 'BADGES',
  'hud.stuck': 'STUCK',
  'hud.pieces': 'Pieces',
  'hud.falling': 'on the edge — move it this turn or it falls',
  'hud.speed': 'Speed',
  'hud.sound': 'Sound',

  'speed.slow': 'Slow',
  'speed.normal': 'Normal',
  'speed.fast': 'Fast',

  'piece.p': 'Pawn',
  'piece.n': 'Knight',
  'piece.b': 'Bishop',
  'piece.r': 'Rook',
  'piece.q': 'Queen',
  'piece.k': 'King',

  'outro.over': 'GAME OVER',
  'outro.mated': 'CHECKMATED',
  'outro.record': 'NEW RECORD',
  'outro.best': 'BEST SCORES',
  'outro.rank': 'YOUR RANK #{n}',
  'outro.skip': 'tap · skip',
  'outro.rows': '{n}r',

  'tip.start': 'The piece with the green ring is you. Tap the square you want to reach.',
  'tip.transform': 'You became the piece you captured — you move like it now.',
  'tip.check': 'Check! This turn the enemy can only save its king. Keep checking and the reward multiplies.',
  'tip.edge': 'Do not linger on the bottom row: the next scroll pushes you off.',
  'tip.stuck':
    'You ran out of moves — one stuck right is gone and the board was rebuilt. When they run out, being stuck ends the run.',
  'tip.king': 'The enemy king is the most valuable target on the board: +25 points, +1 life and a brand new board.',

  'share.rowsSurvived': 'survived {n} rows',
  'share.mated': 'checkmated',
  'share.points': '{n} points',
  'share.rows': '{n} rows',
  'share.streak': '🔥 {n} days',
  'badge.transform': 'Transform',
  'badge.transform.how': 'Become the piece you capture',
  'badge.downgrade': 'Downgrade',
  'badge.downgrade.how': 'Drop to a pawn from a queen or rook',
  'badge.chain': 'Chain',
  'badge.chain.how': 'Give check 3 turns in a row',
  'badge.throne': 'Throne',
  'badge.throne.how': 'Capture the enemy king',
  'badge.breath': 'Breath',
  'badge.breath.how': 'Use a stuck reset',
  'badge.hunter': 'Hunter',
  'badge.hunter.how': 'Capture 2 kings in one Hunt run',
  'badge.fugitive': 'Fugitive',
  'badge.fugitive.how': 'Survive 30 rows in Escape',
  'badge.squad': 'Squad',
  'badge.squad.how': 'Reach 20 rows in Trio without losing a piece',
  'badge.mate': 'Mate',
  'badge.mate.how': 'Checkmate the opponent',
  'badge.sevenDays': 'Seven days',
  'badge.sevenDays.how': 'Reach a 7-day streak',
  'badge.allModes': 'Three games',
  'badge.allModes.how': 'Play all three modes',
  'badge.narrow': 'Narrow corridor',
  'badge.narrow.how': 'Reach 15 rows in a narrow corridor',
}

/* ------------------------------------------------------------------ *
 * DE / ES / FR — arayüz tam, uzun metinler EN'e düşüyor
 * ------------------------------------------------------------------ */

const de: Partial7 = {
  'common.back': 'Zurück',
  'common.close': 'Schließen',
  'common.soon': 'BALD',

  'mode.classic.name': 'Jagd',
  'mode.classic.line': 'Du wirst, was du schlägst. Jage den gegnerischen König.',
  'mode.kingRun.name': 'Flucht',
  'mode.kingRun.line': 'Du bist der König. Angegriffene Felder sind tabu.',
  'mode.trio.name': 'Trio',
  'mode.trio.line': 'Dame, Turm und Läufer. Halte alle drei am Leben.',
  'mode.trio.motto': 'Einer für alle',

  'home.streak': 'SERIE {n} TAGE',
  'home.noStreak': 'KEINE SERIE',
  'home.rank': 'PLATZ',
  'home.rankPending': 'SERVER AUSSTEHEND',
  'home.settings': 'EINSTELLUNGEN',
  'home.daily': 'SPIEL DES TAGES',
  'home.dailyMeta': 'SEED #{seed} · NEU IN {clock}',
  'home.best': 'DEIN BESTES',
  'home.free': 'FREIES SPIEL',
  'home.games': '{n} SPIELE',
  'home.foot': 'HEUTE SPIELEN ALLE DASSELBE BRETT',

  'settings.title': 'EINSTELLUNGEN',
  'settings.pieceColor': 'FIGURENFARBE',
  'settings.pieceColorHint': 'nur Optik',
  'settings.white': 'WEISS',
  'settings.black': 'SCHWARZ',
  'settings.sound': 'TON',
  'settings.soundOn': 'AN',
  'settings.soundOff': 'AUS',
  'settings.soundHint': '8-Bit-Effekte',
  'settings.corridor': 'KORRIDOR',
  'settings.corridorHint': 'nur im freien Spiel',
  'corridor.narrow': 'ENG',
  'corridor.medium': 'MITTEL',
  'corridor.wide': 'WEIT',
  'corridor.cols': '{n} Spalten',
  'settings.lang': 'SPRACHE',
  'settings.langPicked': 'Gewählt: {name}',
  'settings.ranking': 'RANGLISTE',
  'settings.rankMine': 'DEIN PLATZ',
  'settings.scoreMine': 'DEIN SCORE',
  'settings.players': 'SPIELER',
  'settings.openFull': 'FÜR DIE GANZE LISTE TIPPEN',
  'settings.closeFull': 'LISTE SCHLIESSEN',
  'settings.serverPending': 'SERVER AUSSTEHEND',
  'settings.listAllTime': 'ALLZEIT',
  'settings.listWeek': 'DIESE WOCHE',
  'settings.you': 'DU',
  'settings.empty': 'NOCH KEINE LÄUFE',
  'settings.info': 'INFO',
  'settings.howTo': 'SPIELANLEITUNG',
  'settings.about': 'ÜBER',
  'settings.badgesSoon': 'ABZEICHEN FOLGEN',
  'settings.langPartial':
    'Lange Texte und Spieltexte sind noch nicht übersetzt — Englisch wird angezeigt.',

  'help.title': 'SPIELANLEITUNG',
  'about.title': 'ÜBER',
  'about.device': 'GERÄT',
  'about.version': 'VERSION',
  'help.core.title': 'REGELN FÜR ALLE DREI MODI',
  'help.core.1':
    'Nach jedem Zug rückt das Brett eine Reihe vor: oben kommt eine neue Reihe, die unterste verschwindet. Wer unten bleibt, fällt herunter.',
  'help.core.2': 'Kein Passen. Du musst jede Runde ziehen — Warten ist keine Option.',
  'help.core.3':
    'Ohne Zug steckst du fest: Das Brett wird neu aufgebaut, dein Punktestand bleibt und du bekommst +5. Das gilt zweimal pro Lauf; beim dritten Mal ist Schluss.',
  'help.core.4':
    'Jede überlebte Reihe ist 1 Punkt. Alle drei Modi teilen diese Basis und legen ihre eigene Wertung darauf.',
  'help.core.5':
    'Das Spiel des Tages nutzt für alle denselben Seed: gleicher Tag, gleiche Figuren, gleiche Felder. Freie Spiele sind zufällig.',
  'help.classic.1': 'Du beginnst als einzelner Springer.',
  'help.classic.2':
    'Du wirst zu der Figur, die du schlägst — mal gut, mal schlecht. Schlägst du als Dame einen Bauern, bist du ein Bauer.',
  'help.classic.3':
    'Bietest du Schach, darf der Gegner nur einen Zug spielen, der seinen König rettet; gibt es keinen, zieht er eine andere Figur. Schach in Folge vervielfacht die Punkte.',
  'help.classic.4':
    'Schlägst du den gegnerischen König, gibt es Punkte und ein Extraleben, und das Brett wird neu aufgebaut — damit dir das gewonnene Leben nicht sofort wieder genommen wird.',
  'help.kingRun.1': 'Du bist der König. Keine Verwandlung, ein einziges Leben.',
  'help.kingRun.2':
    'Du darfst kein angegriffenes Feld betreten — die echte Schachregel. Ungedeckte Figuren kannst du schlagen, gedeckte nie.',
  'help.kingRun.3':
    'Der König zieht ein Feld pro Runde, das Brett rückt eine Reihe vor: Zum Überleben musst du jede Runde steigen.',
  'help.kingRun.4': 'Bleibt kein sicheres Feld, bist du matt und der Lauf endet.',
  'help.trio.1': 'Dame, Turm und Läufer gehören dir. Pro Runde ziehst du genau eine davon.',
  'help.trio.2':
    'Das Brett rückt weiterhin bei jedem Zug vor, also fallen die beiden ungezogenen Figuren eine Reihe. Alle drei am Leben zu halten ist die eigentliche Aufgabe.',
  'help.trio.3':
    'Punkte kommen aus Distanz und Druck: Eine gegnerische Figur neu zu bedrohen zählt, Mattsetzen ist der Hauptgewinn.',
  'help.trio.4':
    'Eine Figur zu verlieren beendet den Lauf nicht, und wer den gegnerischen König schlägt, bekommt eine verlorene Figur zurück — bei vollem Kader kommt eine vierte dazu.',
  'about.what.title': 'WAS DAS IST',
  'about.what.1':
    'ChessRun kreuzt einen Endless Runner mit Schach: Das Brett rückt bei jedem Zug vor, und du überlebst mit echten Schachzügen.',
  'about.what.2':
    'Die drei Modi teilen sich eine Engine. Diese Engine weiß nichts von React — jede Regel lebt in reinen Funktionen, abgesichert durch Tests.',
  'about.scores.title': 'PUNKTE UND DATENSCHUTZ',
  'about.scores.1':
    'Kein Konto, keine E-Mail, kein Passwort. Dein Browser erzeugt beim ersten Start ein Gerätetoken, mit dem deine Punkte signiert werden.',
  'about.scores.2':
    'Deine Punkte liegen derzeit nur auf diesem Gerät, im lokalen Speicher des Browsers. Löschst du ihn, sind sie weg.',
  'about.scores.3':
    'Der Ranglisten-Server ist noch nicht angebunden. Sobald er es ist, werden dieselben signierten Einträge gesendet; erfasst werden nur Punktzahl, Modus und Gerätetoken.',
  'about.tech.title': 'TECHNIK',
  'about.tech.1':
    'Es gibt keine Audiodateien: Jeder Effekt entsteht live mit einem WebAudio-Oszillator. Die Optik spricht dieselbe Sprache — 8-Bit, harte Hüllkurven, Rechteckwellen.',
  'about.tech.2':
    'Der Tages-Seed leitet sich aus dem Datum ab, und aller Zufall kommt aus einem gesetzten Generator: Derselbe Seed baut auf jedem Gerät dasselbe Brett.',
  'game.menu': 'Menü',
  'game.daily': 'täglich',
  'game.share': 'Ergebnis teilen',
  'game.shareCopied': 'In die Zwischenablage kopiert ✓',
  'game.shareDone': 'Geteilt ✓',
  'game.stuck': 'FESTGEFAHREN',
  'game.stuckSub': 'Brett wird neu aufgebaut · +{n}',
  'game.record': 'NEUER REKORD!',
  'game.weekRecord': 'BESTE DER WOCHE!',
  'game.mated': 'Schachmatt',
  'game.over': 'Spiel vorbei',
  'game.scoreLine': 'Punkte · {n} Reihen',
  'game.yourRecord': 'Dein Rekord',
  'game.thisWeek': 'Diese Woche',
  'game.again': 'Nochmal spielen',
  'game.toMenu': 'Zurück zum Menü',
  'game.tipClose': 'Tipp schließen',
  'hint.threat': 'Du wirst angegriffen — zieh auf ein sicheres Feld.',
  'hint.check': 'Schach! Diese Runde kann der Gegner nur seinen König retten.',
  'hint.kingRun': 'Steig jede Runde, sonst rutschst du eine Reihe Richtung Rand.',
  'phase.playerMove': 'Dein Zug wird gespielt…',
  'phase.boardOut': 'König gefallen — das Brett zerfällt…',
  'phase.boardIn': 'Neues Brett wird aufgebaut…',
  'phase.stuckOut': 'Festgefahren — Figuren werden gemischt…',
  'phase.stuckIn': 'Neue Aufstellung kommt…',
  'phase.scroll': 'Eine neue Reihe kommt…',
  'phase.enemyMove': 'Der Gegner zieht…',
  'flash.kingBonus': 'KÖNIG GESCHLAGEN! +{points} Punkte, +{lives} Leben',
  'flash.capture': '{piece} +{points}',
  'flash.transform': '→ jetzt bist du {piece}',
  'flash.check': 'SCHACH! +{points}',
  'flash.checkStreak': 'SCHACH ×{streak} +{points}',
  'flash.mate': 'MATT! +{points}',
  'flash.checkmated': 'SCHACHMATT',
  'flash.refresh': 'Brett neu aufgebaut',
  'flash.lifeCaptured': 'Geschlagen! −1 Leben',
  'flash.lifeFell': 'Vom Brett gefallen! −1 Leben',
  'flash.pieceCaptured': '{piece} geschlagen! Noch {left}',
  'flash.pieceFell': '{piece} gefallen! Noch {left}',
  'flash.squadGain': '{piece} verstärkt den Kader!',
  'flash.threat': 'DRUCK ×{count} +{points}',
  'hud.score': 'Punkte',
  'hud.distance': 'Distanz',
  'hud.level': 'Level',
  'hud.lives': 'Leben',
  'hud.check': 'SCHACH',
  'hud.threat': 'GEFAHR',
  'hud.moves': 'Züge',
  'hud.safeMoves': 'sichere Züge',
  'game.badges': 'ABZEICHEN',
  'hud.stuck': 'RETTUNG',
  'hud.pieces': 'Figuren',
  'hud.falling': 'am Rand — diese Runde ziehen, sonst fällt sie',
  'hud.speed': 'Tempo',
  'hud.sound': 'Ton',
  'speed.slow': 'Langsam',
  'speed.normal': 'Normal',
  'speed.fast': 'Schnell',
  'piece.p': 'Bauer',
  'piece.n': 'Springer',
  'piece.b': 'Läufer',
  'piece.r': 'Turm',
  'piece.q': 'Dame',
  'piece.k': 'König',
  'outro.over': 'SPIEL VORBEI',
  'outro.mated': 'SCHACHMATT',
  'outro.record': 'NEUER REKORD',
  'outro.best': 'BESTENLISTE',
  'outro.rank': 'DEIN PLATZ #{n}',
  'outro.skip': 'tippen · überspringen',
  'outro.rows': '{n}R',
  'tip.start':
    'Die Figur mit dem grünen Ring bist du. Tippe das Feld an, auf das du ziehen willst.',
  'tip.transform': 'Du bist zur geschlagenen Figur geworden — jetzt ziehst du wie sie.',
  'tip.check':
    'Schach! Diese Runde kann der Gegner nur seinen König retten. Bleib dran, die Punkte vervielfachen sich.',
  'tip.edge': 'Bleib nicht in der untersten Reihe: Beim nächsten Vorrücken fällst du heraus.',
  'tip.stuck':
    'Keine Züge mehr — eine Rettung ist verbraucht und das Brett wurde neu aufgebaut. Sind sie aufgebraucht, endet der Lauf.',
  'tip.king':
    'Der gegnerische König ist das wertvollste Ziel auf dem Brett: +25 Punkte, +1 Leben und ein brandneues Brett.',
  'share.rowsSurvived': '{n} Reihen überstanden',
  'share.mated': 'schachmatt',
  'share.points': '{n} Punkte',
  'share.rows': '{n} Reihen',
  'share.streak': '🔥 {n} Tage',
  'badge.transform': 'Verwandlung',
  'badge.transform.how': 'Werde zur geschlagenen Figur',
  'badge.downgrade': 'Abstieg',
  'badge.downgrade.how': 'Falle von Dame oder Turm zum Bauern',
  'badge.chain': 'Kette',
  'badge.chain.how': 'Biete 3 Züge hintereinander Schach',
  'badge.throne': 'Thron',
  'badge.throne.how': 'Schlage den gegnerischen König',
  'badge.breath': 'Atem',
  'badge.breath.how': 'Nutze eine Festgefahren-Hilfe',
  'badge.hunter': 'Jäger',
  'badge.hunter.how': 'Schlage 2 Könige in einem Jagd-Lauf',
  'badge.fugitive': 'Flüchtling',
  'badge.fugitive.how': 'Überstehe 30 Reihen in Flucht',
  'badge.squad': 'Trupp',
  'badge.squad.how': 'Erreiche in Trio 20 Reihen ohne Figurverlust',
  'badge.mate': 'Matt',
  'badge.mate.how': 'Setze den Gegner matt',
  'badge.sevenDays': 'Sieben Tage',
  'badge.sevenDays.how': 'Erreiche eine 7-Tage-Serie',
  'badge.allModes': 'Drei Spiele',
  'badge.allModes.how': 'Spiele alle drei Modi',
  'badge.narrow': 'Enger Korridor',
  'badge.narrow.how': 'Erreiche 15 Reihen im engen Korridor',
}

const es: Partial7 = {
  'common.back': 'Atrás',
  'common.close': 'Cerrar',
  'common.soon': 'PRONTO',

  'mode.classic.name': 'Caza',
  'mode.classic.line': 'Te conviertes en lo que capturas. Caza al rey enemigo.',
  'mode.kingRun.name': 'Huida',
  'mode.kingRun.line': 'Eres el rey. No puedes pisar una casilla atacada.',
  'mode.trio.name': 'Trío',
  'mode.trio.line': 'Dama, torre y alfil. Mantén vivas a las tres.',
  'mode.trio.motto': 'Todos para uno',

  'home.streak': 'RACHA {n} DÍAS',
  'home.noStreak': 'SIN RACHA',
  'home.rank': 'PUESTO',
  'home.rankPending': 'SERVIDOR PENDIENTE',
  'home.settings': 'AJUSTES',
  'home.daily': 'PARTIDA DE HOY',
  'home.dailyMeta': 'SEMILLA #{seed} · CAMBIA EN {clock}',
  'home.best': 'TU MEJOR',
  'home.free': 'LIBRE',
  'home.games': '{n} PARTIDAS',
  'home.foot': 'HOY TODOS JUEGAN EL MISMO TABLERO',

  'settings.title': 'AJUSTES',
  'settings.pieceColor': 'COLOR DE PIEZA',
  'settings.pieceColorHint': 'solo aspecto',
  'settings.white': 'BLANCAS',
  'settings.black': 'NEGRAS',
  'settings.sound': 'SONIDO',
  'settings.soundOn': 'SÍ',
  'settings.soundOff': 'NO',
  'settings.soundHint': 'efectos de 8 bits',
  'settings.corridor': 'PASILLO',
  'settings.corridorHint': 'solo en partida libre',
  'corridor.narrow': 'ESTRECHO',
  'corridor.medium': 'MEDIO',
  'corridor.wide': 'ANCHO',
  'corridor.cols': '{n} columnas',
  'settings.lang': 'IDIOMA',
  'settings.langPicked': 'Elegido: {name}',
  'settings.ranking': 'CLASIFICACIÓN',
  'settings.rankMine': 'TU PUESTO',
  'settings.scoreMine': 'TU PUNTAJE',
  'settings.players': 'JUGADORES',
  'settings.openFull': 'TOCA PARA VER LA LISTA',
  'settings.closeFull': 'CERRAR LA LISTA',
  'settings.serverPending': 'SERVIDOR PENDIENTE',
  'settings.listAllTime': 'HISTÓRICO',
  'settings.listWeek': 'ESTA SEMANA',
  'settings.you': 'TÚ',
  'settings.empty': 'AÚN SIN PARTIDAS',
  'settings.info': 'INFO',
  'settings.howTo': 'CÓMO SE JUEGA',
  'settings.about': 'ACERCA DE',
  'settings.badgesSoon': 'INSIGNIAS PRONTO',
  'settings.langPartial':
    'Los textos largos y del juego aún no están traducidos — se muestra en inglés.',

  'help.title': 'CÓMO SE JUEGA',
  'about.title': 'ACERCA DE',
  'about.device': 'DISPOSITIVO',
  'about.version': 'VERSIÓN',
  'help.core.title': 'REGLAS COMUNES A LOS TRES MODOS',
  'help.core.1':
    'Tras cada movimiento el tablero avanza una fila: entra una fila nueva por arriba y desaparece la de abajo. Si te quedas abajo, te caes.',
  'help.core.2': 'No se puede pasar. Tienes que mover cada turno: esperar no es una opción.',
  'help.core.3':
    'Si te quedas sin movimientos te atascas: el tablero se rehace, conservas tu puntuación y ganas +5. Ocurre dos veces por partida; a la tercera, se acabó.',
  'help.core.4':
    'Cada fila que sobrevives vale 1 punto. Los tres modos comparten esa base y suman su propia puntuación encima.',
  'help.core.5':
    'La partida de hoy usa la misma semilla para todos: mismo día, mismas piezas, mismas casillas. Las partidas libres son aleatorias.',
  'help.classic.1': 'Empiezas como un solo caballo.',
  'help.classic.2':
    'Te conviertes en la pieza que capturas, para bien o para mal. Si comes un peón siendo dama, bajas a peón.',
  'help.classic.3':
    'Si das jaque, el rival solo puede jugar un movimiento que salve a su rey; si no existe, mueve otra pieza. Los jaques seguidos multiplican la recompensa.',
  'help.classic.4':
    'Capturar al rey enemigo da puntos y una vida extra, y el tablero se rehace para que no te quiten enseguida lo que acabas de ganar.',
  'help.kingRun.1': 'Eres el rey. Sin transformaciones y con una sola vida.',
  'help.kingRun.2':
    'No puedes pisar una casilla atacada: es la regla real del ajedrez. Puedes comer una pieza sin defensa, nunca una defendida.',
  'help.kingRun.3':
    'El rey avanza una casilla por turno y el tablero una fila: para sobrevivir tienes que subir cada turno.',
  'help.kingRun.4': 'Si no queda ninguna casilla segura, te dan mate y la partida termina.',
  'help.trio.1': 'La dama, la torre y el alfil son tuyos. Cada turno mueves exactamente una.',
  'help.trio.2':
    'El tablero sigue avanzando con cada movimiento, así que las dos piezas que no mueves bajan una fila. Mantener vivas a las tres es el verdadero problema.',
  'help.trio.3':
    'Los puntos vienen de la distancia y de la presión: amenazar una pieza enemiga suma, y dar mate es el premio gordo.',
  'help.trio.4':
    'Perder una pieza no termina la partida, y capturar al rey enemigo devuelve la que falta; con la plantilla completa se une una cuarta.',
  'about.what.title': 'QUÉ ES ESTO',
  'about.what.1':
    'ChessRun cruza un endless runner con el ajedrez: el tablero avanza con cada movimiento y sobrevives usando jugadas de ajedrez reales.',
  'about.what.2':
    'Los tres modos comparten un motor. Ese motor no sabe nada de React: cada regla vive en funciones puras cubiertas por pruebas.',
  'about.scores.title': 'PUNTUACIONES Y PRIVACIDAD',
  'about.scores.1':
    'Sin cuenta, sin correo, sin contraseña. Tu navegador genera un token de dispositivo la primera vez y tus puntuaciones se firman con él.',
  'about.scores.2':
    'Ahora mismo tus puntuaciones solo viven en este dispositivo, en el almacenamiento local del navegador. Si lo borras, desaparecen.',
  'about.scores.3':
    'El servidor de clasificación aún no está conectado. Cuando lo esté se enviarán esos mismos registros firmados; solo se recogen puntuación, modo y token de dispositivo.',
  'about.tech.title': 'TÉCNICA',
  'about.tech.1':
    'No hay archivos de audio: cada efecto se genera en directo con un oscilador WebAudio. Lo visual habla el mismo idioma: 8 bits, envolventes duras, ondas cuadradas.',
  'about.tech.2':
    'La semilla diaria se deriva de la fecha y todo el azar sale de un generador con semilla: la misma semilla construye el mismo tablero en cualquier dispositivo.',
  'game.menu': 'Menú',
  'game.daily': 'diaria',
  'game.share': 'Compartir resultado',
  'game.shareCopied': 'Copiado al portapapeles ✓',
  'game.shareDone': 'Compartido ✓',
  'game.stuck': 'ATASCADO',
  'game.stuckSub': 'rehaciendo el tablero · +{n}',
  'game.record': '¡NUEVO RÉCORD!',
  'game.weekRecord': '¡MEJOR DE LA SEMANA!',
  'game.mated': 'Jaque mate',
  'game.over': 'Fin de la partida',
  'game.scoreLine': 'puntos · {n} filas',
  'game.yourRecord': 'Tu récord',
  'game.thisWeek': 'Esta semana',
  'game.again': 'Jugar otra vez',
  'game.toMenu': 'Volver al menú',
  'game.tipClose': 'Cerrar el consejo',
  'hint.threat': 'Estás amenazado: muévete a una casilla segura.',
  'hint.check': '¡Jaque! Este turno el rival solo puede salvar a su rey.',
  'hint.kingRun': 'Sube cada turno o bajarás una fila hacia el borde.',
  'phase.playerMove': 'Jugando tu movimiento…',
  'phase.boardOut': 'Rey caído: el tablero se deshace…',
  'phase.boardIn': 'Construyendo un tablero nuevo…',
  'phase.stuckOut': 'Atascado: barajando las piezas…',
  'phase.stuckIn': 'Llega la nueva disposición…',
  'phase.scroll': 'Llega una fila nueva…',
  'phase.enemyMove': 'Mueve el rival…',
  'flash.kingBonus': '¡REY CAPTURADO! +{points} puntos, +{lives} vida',
  'flash.capture': '{piece} +{points}',
  'flash.transform': '→ ahora eres {piece}',
  'flash.check': '¡JAQUE! +{points}',
  'flash.checkStreak': 'JAQUE ×{streak} +{points}',
  'flash.mate': '¡MATE! +{points}',
  'flash.checkmated': 'JAQUE MATE',
  'flash.refresh': 'Tablero rehecho',
  'flash.lifeCaptured': '¡Te comieron! −1 vida',
  'flash.lifeFell': '¡Te caíste del tablero! −1 vida',
  'flash.pieceCaptured': '¡{piece} capturada! Quedan {left}',
  'flash.pieceFell': '¡{piece} se cayó! Quedan {left}',
  'flash.squadGain': '¡{piece} se une al equipo!',
  'flash.threat': 'AMENAZA ×{count} +{points}',
  'hud.score': 'Puntos',
  'hud.distance': 'Distancia',
  'hud.level': 'Nivel',
  'hud.lives': 'Vidas',
  'hud.check': 'JAQUE',
  'hud.threat': 'AMENAZA',
  'hud.moves': 'jugadas',
  'hud.safeMoves': 'jugadas seguras',
  'game.badges': 'INSIGNIAS',
  'hud.stuck': 'RESCATES',
  'hud.pieces': 'Piezas',
  'hud.falling': 'al borde: muévela este turno o se cae',
  'hud.speed': 'Velocidad',
  'hud.sound': 'Sonido',
  'speed.slow': 'Lenta',
  'speed.normal': 'Normal',
  'speed.fast': 'Rápida',
  'piece.p': 'Peón',
  'piece.n': 'Caballo',
  'piece.b': 'Alfil',
  'piece.r': 'Torre',
  'piece.q': 'Dama',
  'piece.k': 'Rey',
  'outro.over': 'FIN DE LA PARTIDA',
  'outro.mated': 'JAQUE MATE',
  'outro.record': 'NUEVO RÉCORD',
  'outro.best': 'MEJORES PUNTUACIONES',
  'outro.rank': 'TU PUESTO #{n}',
  'outro.skip': 'toca · saltar',
  'outro.rows': '{n}f',
  'tip.start': 'La pieza con el anillo verde eres tú. Toca la casilla a la que quieres ir.',
  'tip.transform': 'Te has convertido en la pieza que capturaste: ahora te mueves como ella.',
  'tip.check':
    '¡Jaque! Este turno el rival solo puede salvar a su rey. Sigue dando jaque y la recompensa se multiplica.',
  'tip.edge': 'No te quedes en la fila de abajo: el siguiente avance te empuja fuera.',
  'tip.stuck':
    'Te quedaste sin jugadas: has gastado un rescate y el tablero se rehizo. Cuando se acaben, atascarse termina la partida.',
  'tip.king':
    'El rey enemigo es el objetivo más valioso del tablero: +25 puntos, +1 vida y un tablero nuevo.',
  'share.rowsSurvived': 'sobrevivió {n} filas',
  'share.mated': 'jaque mate',
  'share.points': '{n} puntos',
  'share.rows': '{n} filas',
  'share.streak': '🔥 {n} días',
  'badge.transform': 'Transformación',
  'badge.transform.how': 'Conviértete en la pieza que capturas',
  'badge.downgrade': 'Caída',
  'badge.downgrade.how': 'Baja de dama o torre a peón',
  'badge.chain': 'Cadena',
  'badge.chain.how': 'Da jaque 3 turnos seguidos',
  'badge.throne': 'Trono',
  'badge.throne.how': 'Captura al rey rival',
  'badge.breath': 'Respiro',
  'badge.breath.how': 'Usa un reinicio por bloqueo',
  'badge.hunter': 'Cazador',
  'badge.hunter.how': 'Captura 2 reyes en una partida de Caza',
  'badge.fugitive': 'Fugitivo',
  'badge.fugitive.how': 'Aguanta 30 filas en Huida',
  'badge.squad': 'Escuadra',
  'badge.squad.how': 'Llega a 20 filas en Trío sin perder piezas',
  'badge.mate': 'Mate',
  'badge.mate.how': 'Da jaque mate al rival',
  'badge.sevenDays': 'Siete días',
  'badge.sevenDays.how': 'Alcanza una racha de 7 días',
  'badge.allModes': 'Tres juegos',
  'badge.allModes.how': 'Juega los tres modos',
  'badge.narrow': 'Pasillo estrecho',
  'badge.narrow.how': 'Llega a 15 filas en pasillo estrecho',
}

const fr: Partial7 = {
  'common.back': 'Retour',
  'common.close': 'Fermer',
  'common.soon': 'BIENTÔT',

  'mode.classic.name': 'Chasse',
  'mode.classic.line': 'Tu deviens ce que tu prends. Chasse le roi adverse.',
  'mode.kingRun.name': 'Fuite',
  'mode.kingRun.line': 'Tu es le roi. Interdit d’aller sur une case attaquée.',
  'mode.trio.name': 'Trio',
  'mode.trio.line': 'Dame, tour et fou. Garde les trois en vie.',
  'mode.trio.motto': 'Un pour tous',

  'home.streak': 'SÉRIE {n} JOURS',
  'home.noStreak': 'AUCUNE SÉRIE',
  'home.rank': 'RANG',
  'home.rankPending': 'SERVEUR EN ATTENTE',
  'home.settings': 'RÉGLAGES',
  'home.daily': 'PARTIE DU JOUR',
  'home.dailyMeta': 'GRAINE #{seed} · CHANGE DANS {clock}',
  'home.best': 'TON RECORD',
  'home.free': 'LIBRE',
  'home.games': '{n} PARTIES',
  'home.foot': 'AUJOURD’HUI TOUT LE MONDE JOUE LE MÊME ÉCHIQUIER',

  'settings.title': 'RÉGLAGES',
  'settings.pieceColor': 'COULEUR DES PIÈCES',
  'settings.pieceColorHint': 'apparence seulement',
  'settings.white': 'BLANCS',
  'settings.black': 'NOIRS',
  'settings.sound': 'SON',
  'settings.soundOn': 'OUI',
  'settings.soundOff': 'NON',
  'settings.soundHint': 'effets 8 bits',
  'settings.corridor': 'COULOIR',
  'settings.corridorHint': 'en partie libre',
  'corridor.narrow': 'ÉTROIT',
  'corridor.medium': 'MOYEN',
  'corridor.wide': 'LARGE',
  'corridor.cols': '{n} colonnes',
  'settings.lang': 'LANGUE',
  'settings.langPicked': 'Choisie : {name}',
  'settings.ranking': 'CLASSEMENT',
  'settings.rankMine': 'TON RANG',
  'settings.scoreMine': 'TON SCORE',
  'settings.players': 'JOUEURS',
  'settings.openFull': 'TOUCHE POUR LA LISTE',
  'settings.closeFull': 'FERMER LA LISTE',
  'settings.serverPending': 'SERVEUR EN ATTENTE',
  'settings.listAllTime': 'DEPUIS TOUJOURS',
  'settings.listWeek': 'CETTE SEMAINE',
  'settings.you': 'TOI',
  'settings.empty': 'AUCUNE PARTIE',
  'settings.info': 'INFOS',
  'settings.howTo': 'COMMENT JOUER',
  'settings.about': 'À PROPOS',
  'settings.badgesSoon': 'BADGES À VENIR',
  'settings.langPartial':
    'Les textes longs et ceux du jeu ne sont pas encore traduits — affichés en anglais.',

  'help.title': 'COMMENT JOUER',
  'about.title': 'À PROPOS',
  'about.device': 'APPAREIL',
  'about.version': 'VERSION',
  'help.core.title': 'RÈGLES COMMUNES AUX TROIS MODES',
  'help.core.1':
    'Après chaque coup, l\'échiquier avance d\'une rangée : une nouvelle rangée arrive en haut, celle du bas disparaît. Rester en bas, c\'est tomber.',
  'help.core.2': 'Pas de passe. Tu dois jouer à chaque tour — attendre n\'est pas une option.',
  'help.core.3':
    'Sans coup possible, tu es bloqué : l\'échiquier est reconstruit, ton score reste et tu gagnes +5. C\'est valable deux fois par partie ; la troisième, c\'est fini.',
  'help.core.4':
    'Chaque rangée survécue vaut 1 point. Les trois modes partagent cette base et ajoutent leur propre score.',
  'help.core.5':
    'La partie du jour utilise la même graine pour tout le monde : même jour, mêmes pièces, mêmes cases. Les parties libres sont aléatoires.',
  'help.classic.1': 'Tu commences avec un seul cavalier.',
  'help.classic.2':
    'Tu deviens la pièce que tu prends — pour le meilleur ou pour le pire. Prendre un pion en étant dame te fait tomber au rang de pion.',
  'help.classic.3':
    'En donnant échec, l\'adversaire ne peut jouer qu\'un coup qui sauve son roi ; s\'il n\'y en a pas, il joue une autre pièce. Les échecs consécutifs multiplient les points.',
  'help.classic.4':
    'Prendre le roi adverse rapporte des points et une vie, et l\'échiquier est reconstruit — pour que la vie gagnée ne reparte pas aussitôt.',
  'help.kingRun.1': 'Tu es le roi. Aucune transformation, une seule vie.',
  'help.kingRun.2':
    'Interdit d\'aller sur une case attaquée : c\'est la vraie règle des échecs. Tu peux prendre une pièce non défendue, jamais une pièce défendue.',
  'help.kingRun.3':
    'Le roi avance d\'une case par tour et l\'échiquier d\'une rangée : pour survivre, il faut monter à chaque tour.',
  'help.kingRun.4': 'S\'il ne reste aucune case sûre, tu es mat et la partie s\'arrête.',
  'help.trio.1':
    'La dame, la tour et le fou sont à toi. À chaque tour tu en joues exactement une.',
  'help.trio.2':
    'L\'échiquier avance toujours à chaque coup : les deux pièces que tu n\'as pas jouées descendent d\'une rangée. Garder les trois en vie, voilà le vrai problème.',
  'help.trio.3':
    'Les points viennent de la distance et de la pression : menacer une pièce adverse rapporte, et le mat est le gros lot.',
  'help.trio.4':
    'Perdre une pièce ne termine pas la partie, et prendre le roi adverse ramène la pièce manquante ; avec un effectif complet, une quatrième s\'ajoute.',
  'about.what.title': 'DE QUOI IL S\'AGIT',
  'about.what.1':
    'ChessRun croise un endless runner et les échecs : l\'échiquier avance à chaque coup et tu survis avec de vrais coups d\'échecs.',
  'about.what.2':
    'Les trois modes partagent un moteur. Ce moteur ignore tout de React : chaque règle vit dans des fonctions pures couvertes par des tests.',
  'about.scores.title': 'SCORES ET VIE PRIVÉE',
  'about.scores.1':
    'Pas de compte, pas d\'e-mail, pas de mot de passe. Ton navigateur génère un jeton d\'appareil au premier lancement et tes scores sont signés avec.',
  'about.scores.2':
    'Tes scores ne vivent pour l\'instant que sur cet appareil, dans le stockage local du navigateur. Si tu l\'effaces, ils disparaissent.',
  'about.scores.3':
    'Le serveur de classement n\'est pas encore branché. Quand il le sera, ce sont les mêmes enregistrements signés qui partiront ; seuls le score, le mode et le jeton d\'appareil sont collectés.',
  'about.tech.title': 'TECHNIQUE',
  'about.tech.1':
    'Aucun fichier audio : chaque effet est généré en direct par un oscillateur WebAudio. Le visuel parle la même langue — 8 bits, enveloppes sèches, ondes carrées.',
  'about.tech.2':
    'La graine du jour vient de la date et tout le hasard sort d\'un générateur ensemencé : la même graine construit le même échiquier sur tous les appareils.',
  'game.menu': 'Menu',
  'game.daily': 'du jour',
  'game.share': 'Partager le résultat',
  'game.shareCopied': 'Copié dans le presse-papiers ✓',
  'game.shareDone': 'Partagé ✓',
  'game.stuck': 'BLOQUÉ',
  'game.stuckSub': 'reconstruction de l\'échiquier · +{n}',
  'game.record': 'NOUVEAU RECORD !',
  'game.weekRecord': 'MEILLEUR DE LA SEMAINE !',
  'game.mated': 'Échec et mat',
  'game.over': 'Partie terminée',
  'game.scoreLine': 'points · {n} rangées',
  'game.yourRecord': 'Ton record',
  'game.thisWeek': 'Cette semaine',
  'game.again': 'Rejouer',
  'game.toMenu': 'Retour au menu',
  'game.tipClose': 'Fermer le conseil',
  'hint.threat': 'Tu es menacé — va sur une case sûre.',
  'hint.check': 'Échec ! Ce tour, l\'adversaire ne peut que sauver son roi.',
  'hint.kingRun': 'Monte à chaque tour, sinon tu descends d\'une rangée vers le bord.',
  'phase.playerMove': 'Ton coup se joue…',
  'phase.boardOut': 'Roi tombé — l\'échiquier se disloque…',
  'phase.boardIn': 'Nouvel échiquier en construction…',
  'phase.stuckOut': 'Bloqué — les pièces sont mélangées…',
  'phase.stuckIn': 'Nouvelle disposition en approche…',
  'phase.scroll': 'Une nouvelle rangée arrive…',
  'phase.enemyMove': 'L\'adversaire joue…',
  'flash.kingBonus': 'ROI PRIS ! +{points} points, +{lives} vie',
  'flash.capture': '{piece} +{points}',
  'flash.transform': '→ tu es maintenant {piece}',
  'flash.check': 'ÉCHEC ! +{points}',
  'flash.checkStreak': 'ÉCHEC ×{streak} +{points}',
  'flash.mate': 'MAT ! +{points}',
  'flash.checkmated': 'ÉCHEC ET MAT',
  'flash.refresh': 'Échiquier reconstruit',
  'flash.lifeCaptured': 'Pris ! −1 vie',
  'flash.lifeFell': 'Tombé de l\'échiquier ! −1 vie',
  'flash.pieceCaptured': '{piece} prise ! Il en reste {left}',
  'flash.pieceFell': '{piece} tombée ! Il en reste {left}',
  'flash.squadGain': '{piece} rejoint l\'équipe !',
  'flash.threat': 'MENACE ×{count} +{points}',
  'hud.score': 'Score',
  'hud.distance': 'Distance',
  'hud.level': 'Niveau',
  'hud.lives': 'Vies',
  'hud.check': 'ÉCHEC',
  'hud.threat': 'MENACE',
  'hud.moves': 'coups',
  'hud.safeMoves': 'coups sûrs',
  'game.badges': 'BADGES',
  'hud.stuck': 'SAUVETAGES',
  'hud.pieces': 'Pièces',
  'hud.falling': 'au bord — joue-la ce tour ou elle tombe',
  'hud.speed': 'Vitesse',
  'hud.sound': 'Son',
  'speed.slow': 'Lente',
  'speed.normal': 'Normale',
  'speed.fast': 'Rapide',
  'piece.p': 'Pion',
  'piece.n': 'Cavalier',
  'piece.b': 'Fou',
  'piece.r': 'Tour',
  'piece.q': 'Dame',
  'piece.k': 'Roi',
  'outro.over': 'PARTIE TERMINÉE',
  'outro.mated': 'ÉCHEC ET MAT',
  'outro.record': 'NOUVEAU RECORD',
  'outro.best': 'MEILLEURS SCORES',
  'outro.rank': 'TON RANG #{n}',
  'outro.skip': 'touche · passer',
  'outro.rows': '{n}r',
  'tip.start': 'La pièce avec l\'anneau vert, c\'est toi. Touche la case où tu veux aller.',
  'tip.transform':
    'Tu es devenu la pièce que tu as prise — tu te déplaces comme elle maintenant.',
  'tip.check':
    'Échec ! Ce tour, l\'adversaire ne peut que sauver son roi. Continue, la récompense se multiplie.',
  'tip.edge': 'Ne reste pas sur la rangée du bas : la prochaine avancée te pousse dehors.',
  'tip.stuck':
    'Plus de coups — un sauvetage est consommé et l\'échiquier a été reconstruit. Une fois épuisés, être bloqué termine la partie.',
  'tip.king':
    'Le roi adverse est la cible la plus précieuse : +25 points, +1 vie et un échiquier tout neuf.',
  'share.rowsSurvived': '{n} rangées tenues',
  'share.mated': 'échec et mat',
  'share.points': '{n} points',
  'share.rows': '{n} rangées',
  'share.streak': '🔥 {n} jours',
  'badge.transform': 'Transformation',
  'badge.transform.how': 'Deviens la pièce que tu captures',
  'badge.downgrade': 'Chute',
  'badge.downgrade.how': 'Retombe au pion depuis dame ou tour',
  'badge.chain': 'Chaîne',
  'badge.chain.how': 'Fais échec 3 tours de suite',
  'badge.throne': 'Trône',
  'badge.throne.how': 'Capture le roi adverse',
  'badge.breath': 'Répit',
  'badge.breath.how': 'Utilise une relance de blocage',
  'badge.hunter': 'Chasseur',
  'badge.hunter.how': 'Capture 2 rois dans une partie de Chasse',
  'badge.fugitive': 'Fugitif',
  'badge.fugitive.how': 'Tiens 30 rangées en Fuite',
  'badge.squad': 'Escouade',
  'badge.squad.how': 'Atteins 20 rangées en Trio sans perdre de pièce',
  'badge.mate': 'Mat',
  'badge.mate.how': "Fais mat l'adversaire",
  'badge.sevenDays': 'Sept jours',
  'badge.sevenDays.how': 'Atteins une série de 7 jours',
  'badge.allModes': 'Trois jeux',
  'badge.allModes.how': 'Joue les trois modes',
  'badge.narrow': 'Couloir étroit',
  'badge.narrow.how': 'Atteins 15 rangées en couloir étroit',
}

const DICTS: Record<Lang, Partial7> = { tr, en, de, es, fr }

/**
 * Dilin uzun metinleri tam mı?
 *
 * Sabit bir liste yerine sözlüğün kendisinden hesaplanıyor: yeni bir uzun
 * metin anahtarı eklenip bir dilde unutulursa uyarı kendiliğinden geri
 * geliyor, kimsenin listeyi güncellemesi gerekmiyor.
 */
export function hasFullProse(lang: Lang): boolean {
  return missingKeys(lang).every((key) => !isProseKey(key))
}

/**
 * Oyun içi ve uzun metin anahtarları. Bunlar DE/ES/FR'de kasten yok ve
 * İngilizceye düşüyorlar; geri kalan her şey ("kabuk") her dilde tam olmalı.
 */
const PROSE_PREFIXES = [
  'help.',
  'about.',
  'game.',
  'hint.',
  'phase.',
  'flash.',
  'hud.',
  'speed.',
  'piece.',
  'outro.',
  'tip.',
  'share.',
]

export function isProseKey(key: string): boolean {
  return PROSE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export const ALL_KEYS = Object.keys(tr) as StringKey[]

/**
 * Her dilde aynı yazılan anahtarlar: oyunun ve modun özel adı, arcade
 * kabinlerinden gelen HI kısaltması. Çevrilmiyorlar, eksik de sayılmıyorlar.
 */
const UNIVERSAL: StringKey[] = ['app.name', 'home.hi']

/** Bir dilde kendi karşılığı olmayan anahtarlar — testler bunu bekçi olarak kullanıyor */
export function missingKeys(lang: Lang): StringKey[] {
  return ALL_KEYS.filter((key) => !UNIVERSAL.includes(key) && DICTS[lang][key] == null)
}

/**
 * Çeviri. Eksik anahtar önce EN'e, sonra TR'ye düşüyor — hiçbir durumda
 * ham anahtar ekrana çıkmıyor.
 */
export function translate(
  lang: Lang,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  // Son çare anahtarın kendisi: bilinmeyen bir anahtar arayüzü çökertmemeli
  const text = DICTS[lang][key] ?? en[key] ?? tr[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}
