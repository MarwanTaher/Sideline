ALTER TABLE match_guests ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_match_guests_status ON match_guests (match_id, status);
