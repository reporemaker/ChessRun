-- Skor sahteciliği frenleri (19 Ağustos 2026): jeton başına dakikalık koşu
-- sayacı. Pencere başlangıcı + pencere içi sayaç; sınır aşılınca koşu
-- sessizce düşer (204). Panel "şüpheli" işaretinde de kullanılır.
ALTER TABLE lb_player ADD COLUMN burst_start INTEGER;
ALTER TABLE lb_player ADD COLUMN burst_count INTEGER NOT NULL DEFAULT 0;
