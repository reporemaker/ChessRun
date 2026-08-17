-- ChessRun istatistik şeması
--
-- Karar: melez. Ham olaylar 35 gün, gecelik cron'un ürettiği günlük
-- toplamlar sonsuza kadar; hafta/ay/yıl okuma anında günlük toplamlardan
-- hesaplanıyor.
--
-- Neden sadece okuma anında toplamıyoruz: günde ~8 bin satır ≈ yılda 3
-- milyon. D1 ücretsiz katmanında bağlayıcı kısıt günlük OKUNAN SATIR (5M);
-- yıllık bir sorgu bunu birkaç sayfa yüklemesinde tüketirdi.
--
-- Neden yazma anında toplamıyoruz: sıcak ve herkese açık yola UPDATE
-- çekişmesi bindirirdi (SQLite tek yazarlı), tüm boyut kombinasyonlarını
-- baştan sabitlerdi ve bir hata bulunduğunda yeniden toplamayı imkânsız
-- kılardı.
--
-- IP HİÇBİR YERDE SAKLANMIYOR. Cihaz jetonu buraya HİÇ GELMİYOR.

/* ================= ham olaylar — 35 gün ================= */

CREATE TABLE visit (
  id             INTEGER PRIMARY KEY,
  day            TEXT    NOT NULL,           -- 'YYYY-MM-DD', UTC
  ts             INTEGER NOT NULL,           -- epoch ms
  -- Günlük dönen tuzla hash'lenmiş IP+UA. Tuz 48 saat sonra siliniyor,
  -- o andan itibaren dünkü hash'ler geri döndürülemez.
  visitor_hash   TEXT    NOT NULL,
  session_id     TEXT    NOT NULL,
  country        TEXT,                       -- ISO-3166-1 alpha-2, 'XX' bilinmiyor
  tz             TEXT,                       -- IANA, request.cf'ten
  ui_lang        TEXT,                       -- uygulamada seçili dil
  nav_lang       TEXT,                       -- navigator.language, 2 harf
  accept_lang    TEXT,                       -- Accept-Language ilk etiket
  browser        TEXT,                       -- ayrıştırılmış; ham UA saklanmıyor
  os             TEXT,
  device         TEXT,                       -- mobile | tablet | desktop
  standalone     INTEGER NOT NULL DEFAULT 0, -- PWA olarak mı açıldı
  reduced_motion INTEGER NOT NULL DEFAULT 0,
  touch          INTEGER NOT NULL DEFAULT 0,
  viewport       TEXT,                       -- xs | sm | md | lg
  referrer       TEXT,                       -- YALNIZCA host; yol ve sorgu atılıyor
  app_version    TEXT
);
-- Tekilleştirme burada: aynı gün aynı ziyaretçi tek satır. Tuz günlük
-- döndüğü için gün bazlı tekillik kendiliğinden sağlanıyor.
CREATE UNIQUE INDEX visit_unique  ON visit(day, visitor_hash);
CREATE INDEX        visit_day     ON visit(day);
CREATE INDEX        visit_session ON visit(session_id);

CREATE TABLE run_event (
  id          INTEGER PRIMARY KEY,
  day         TEXT    NOT NULL,
  ts          INTEGER NOT NULL,
  session_id  TEXT    NOT NULL,
  mode        TEXT    NOT NULL,              -- classic | kingRun | trio
  daily       INTEGER NOT NULL DEFAULT 0,
  score       INTEGER NOT NULL,
  distance    INTEGER NOT NULL,
  cols        INTEGER NOT NULL,
  level       INTEGER NOT NULL,
  -- Duvar saati, 0..2 saat aralığına kırpılmış. Sekme arka plandayken de
  -- işlediği için üst kuyruk şişik; panel medyanı da gösteriyor.
  duration_ms INTEGER,
  -- Görünürlüğe duyarlı sayaç için baştan ayrılmış. Şimdilik hep NULL;
  -- doldurulduğunda anlam değişmiyor, sadece daha iyi bir sayı geliyor.
  active_ms   INTEGER,
  end_reason  TEXT,                          -- checkmated|stuckOut|lifeLost|fellOff|other
  kings       INTEGER,
  best_streak INTEGER,
  stuck_used  INTEGER,
  mated       INTEGER,
  speed       TEXT,
  country     TEXT,
  ui_lang     TEXT,
  device      TEXT,
  app_version TEXT
);
CREATE INDEX run_day      ON run_event(day);
CREATE INDEX run_day_mode ON run_event(day, mode);

CREATE TABLE session_event (
  id          INTEGER PRIMARY KEY,
  day         TEXT    NOT NULL,
  ts          INTEGER NOT NULL,
  session_id  TEXT    NOT NULL UNIQUE,
  duration_ms INTEGER,
  runs        INTEGER NOT NULL DEFAULT 0,
  country     TEXT,
  device      TEXT
);
CREATE INDEX session_day ON session_event(day);

/* ================= toplamlar — sonsuza kadar ================= */

CREATE TABLE daily_totals (
  day          TEXT PRIMARY KEY,
  visitors     INTEGER NOT NULL DEFAULT 0,
  sessions     INTEGER NOT NULL DEFAULT 0,
  players      INTEGER NOT NULL DEFAULT 0,   -- en az bir koşusu olan oturum
  runs         INTEGER NOT NULL DEFAULT 0,
  runs_classic INTEGER NOT NULL DEFAULT 0,
  runs_kingrun INTEGER NOT NULL DEFAULT 0,
  runs_trio    INTEGER NOT NULL DEFAULT 0,
  runs_daily   INTEGER NOT NULL DEFAULT 0,
  -- Çok günlü dönemlerde ortalama bunlardan; medyanların ortalaması
  -- alınmıyor. Panel etiketi de "ortalama" diyor, "medyan" demiyor.
  dur_sum_ms   INTEGER NOT NULL DEFAULT 0,
  dur_count    INTEGER NOT NULL DEFAULT 0,
  dur_p50_ms   INTEGER,
  dur_p90_ms   INTEGER,
  score_sum    INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

-- Tek şekil, bütün boyutlar. Yeni bir kırılım eklemek toplama işinde tek
-- satır; API ve panelde sıfır değişiklik. Boyut başına tablo alternatifi
-- sonsuza kadar N migration + N uç + N bileşen demekti.
CREATE TABLE daily_dim (
  day      TEXT    NOT NULL,
  dim      TEXT    NOT NULL,
  value    TEXT    NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  runs     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dim, value)
);
CREATE INDEX daily_dim_lookup ON daily_dim(dim, day);

CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
