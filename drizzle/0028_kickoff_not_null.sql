-- C-1: kickoff_at must never be NULL (the 24 h lock depends on it).
-- Both writers (createMatch, updateMatch) always compute it from played_on + match_time.
UPDATE matches
   SET kickoff_at = (to_timestamp(played_on || ' ' || COALESCE(NULLIF(btrim(match_time), ''), '09:00 pm'), 'YYYY-MM-DD HH12:MI am')::timestamp AT TIME ZONE 'Europe/Warsaw')
 WHERE kickoff_at IS NULL;
--> statement-breakpoint
ALTER TABLE matches ALTER COLUMN kickoff_at SET NOT NULL;
