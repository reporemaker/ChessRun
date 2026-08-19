-- Haftalık lig = o hafta BİRİKTİRİLEN toplam puan (19 Ağustos 2026 kararı).
-- Eskiden satır = haftanın en iyi tek koşusuydu; artık her koşu eklenir.
-- `runs` = bu haftaki koşu sayısı, `best` = en iyi tek koşu (bilgi için).
-- Mevcut satırlar tek koşudan geliyordu: best = score, runs = 1; bu haftanın
-- önceki koşuları toplama girmiyor (geçiş anı, bir defalık).
ALTER TABLE lb_weekly ADD COLUMN runs INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lb_weekly ADD COLUMN best INTEGER NOT NULL DEFAULT 0;
UPDATE lb_weekly SET best = score WHERE best = 0;

-- Aynı koşunun ikinci kez sayılmaması (ağ hatasında istemci kuyruğu yeniden
-- yollar; cevap kaybolmuşsa sunucu zaten yazmıştır). Anahtar: jeton özeti +
-- koşunun kendi zaman damgası. 35 günden eskisi gece temizlenir.
CREATE TABLE lb_run_seen (
  token_hash TEXT    NOT NULL,
  at         TEXT    NOT NULL,
  ts         INTEGER NOT NULL,
  PRIMARY KEY (token_hash, at)
);
CREATE INDEX lb_run_seen_ts ON lb_run_seen(ts);
