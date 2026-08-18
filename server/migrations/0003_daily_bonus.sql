-- Günün Mücadelesi skoru güne bağlı saklanır: o günkü diğer koşulara çarpan
-- (1 + min(skor, 500)/1000) uygulamak için. `ts` sunucu alım zamanı —
-- çarpan yalnızca mücadeleden SONRA gelen koşulara.
ALTER TABLE lb_daily ADD COLUMN score INTEGER;
ALTER TABLE lb_daily ADD COLUMN ts INTEGER;
