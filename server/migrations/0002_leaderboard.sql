-- Haftalık sıralama (Faz 9). İstatistik tablolarından bağımsız: burada
-- kimlik var (jeton hash'i), orada bilerek yok.

-- Oyuncu = cihaz jetonu. Ham jeton HİÇ yazılmıyor: SHA-256'sı anahtar,
-- 'short' yalnızca gösterim (a1b2…9f). Jeton taşıyıcı sır olduğu için
-- veritabanı sızsa bile başkasının adına skor yollanamıyor.
CREATE TABLE lb_player (
  token_hash    TEXT    PRIMARY KEY,
  short         TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  badge         TEXT,
  badge_tier    TEXT,
  status        TEXT    NOT NULL DEFAULT 'ok',   -- ok | shadow | banned
  -- Moderatör "sıfırla" dediğinde eski ad buraya; istemci aynı adı
  -- yollamaya devam etse de kabul edilmiyor. Geri alınabilir (NULL).
  rejected_name TEXT,
  rename_day    TEXT,
  rename_count  INTEGER NOT NULL DEFAULT 0,
  runs          INTEGER NOT NULL DEFAULT 0,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);
CREATE INDEX lb_player_name ON lb_player(name);
CREATE INDEX lb_player_seen ON lb_player(last_seen DESC);

-- Hafta × mod × oyuncu → tek satır, en iyi skor (upsert). "Jeton başına
-- haftada tek en iyi skor" kuralı ve depolama sınırı aynı anda.
CREATE TABLE lb_weekly (
  week        TEXT    NOT NULL,
  mode        TEXT    NOT NULL,
  token_hash  TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  distance    INTEGER NOT NULL,
  at          TEXT    NOT NULL,
  ts          INTEGER NOT NULL,
  PRIMARY KEY (week, mode, token_hash)
);
CREATE INDEX lb_weekly_rank ON lb_weekly(week, mode, score DESC, distance DESC, ts);

-- Günlük nabız: günün tahtasını kaç farklı oyuncu oynadı
CREATE TABLE lb_daily (
  daily       TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  PRIMARY KEY (daily, token_hash)
);

-- Panelden düzenlenen yasaklı kelimeler; shared/names.ts'teki kök listeyle birleşir
CREATE TABLE lb_banned_word (
  word   TEXT    PRIMARY KEY,
  added  INTEGER NOT NULL
);
