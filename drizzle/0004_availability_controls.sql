ALTER TABLE matches ADD COLUMN IF NOT EXISTS max_players integer DEFAULT 18 NOT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS availability_open integer DEFAULT 1 NOT NULL;
UPDATE matches SET availability_open = CASE WHEN matchday_status = 'closed' THEN 0 ELSE 1 END;
