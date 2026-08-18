-- Kalıcılık (Faz 10, 19 Ağustos 2026): kurtarma kodu, sunucu profili,
-- birincilik arşivi, son reddedilen ad.

-- İstemcinin yolladığı ama sunucunun kabul etmediği son ham ad: panel
-- "Oyuncu 73d9…bc" satırının neden yer tutucuda kaldığını görsün.
ALTER TABLE lb_player ADD COLUMN last_rejected TEXT;

-- Oyuncunun kendi yazdığı profil (rozetler, ömür boyu sayaçlar, defter özeti).
-- Sunucu içine bakmaz; `reset_at` moderatörün "başarımları sıfırla" anı -
-- cihaz bunu görünce yerel kopyayı da siler.
CREATE TABLE lb_profile (
  token_hash  TEXT    PRIMARY KEY,
  data        TEXT,
  updated     INTEGER NOT NULL,
  reset_at    INTEGER
);

-- Kurtarma kodu: sunucu kodu görmez. `lookup` koddan türetilmiş SHA-256,
-- `blob` kodla türetilmiş AES anahtarıyla şifreli (jeton + imza anahtarı).
-- Oyuncu başına tek satır (yeni kod eskisini siler).
CREATE TABLE lb_recovery (
  lookup      TEXT    PRIMARY KEY,
  token_hash  TEXT    NOT NULL,
  blob        TEXT    NOT NULL,
  created     INTEGER NOT NULL
);
CREATE INDEX lb_recovery_player ON lb_recovery(token_hash);

-- Bitmiş haftaların ilk üçü. lb_weekly ~8 haftada budandığı için lig
-- rozetleri (birincilikler) buradan da okunur. Cron her gün önceki haftayı
-- yeniden yazar (geç gelen koşu sıralamayı değiştirmiş olabilir).
CREATE TABLE lb_award (
  week        TEXT    NOT NULL,
  mode        TEXT    NOT NULL,
  token_hash  TEXT    NOT NULL,
  place       INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  PRIMARY KEY (week, mode, token_hash)
);
CREATE INDEX lb_award_player ON lb_award(token_hash);
