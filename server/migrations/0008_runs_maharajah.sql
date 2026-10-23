-- Mihrace (23 Ekim 2026): istatistikte oyun bazında ayrı sayaç.
-- Eski günlerde 0 - Mihrace o güne kadar istatistiğe hiç gönderilmiyordu.
ALTER TABLE daily_totals ADD COLUMN runs_maharajah INTEGER NOT NULL DEFAULT 0;
