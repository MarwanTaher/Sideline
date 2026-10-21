-- Field view v2: per-match team kit colours, JSON {teamNo: kitKey}. Additive.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_colors text;
