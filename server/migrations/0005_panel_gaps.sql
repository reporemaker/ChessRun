-- Panel eksikleri (19 Ağustos 2026): toplanıp gösterilmeyen veri.
--
-- Oturum süresi zaten `session_event.duration_ms`te ham duruyordu ama
-- günlük toplama girmiyordu; 35 gün sonra kayboluyordu. Koşu mesafesi de
-- öyle. Yeni sütunlar; eski satırlarda 0/NULL. Son 35 gün ham satırdan
-- yeniden toplanabilir: GET /api/rollup?from=<35 gün önce>&to=<dün>.
ALTER TABLE daily_totals ADD COLUMN sess_dur_sum_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_totals ADD COLUMN sess_dur_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_totals ADD COLUMN sess_dur_p50_ms INTEGER;
ALTER TABLE daily_totals ADD COLUMN dist_sum        INTEGER NOT NULL DEFAULT 0;
