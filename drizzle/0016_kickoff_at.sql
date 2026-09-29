-- Kickoff as a real instant.
--
-- `played_on` + `match_time` ("09:00 pm") were free text compared against the
-- server clock, which is UTC on Vercel — so anything time-sensitive (the 24h
-- availability lock) fired hours late. `kickoff_at` stores the true instant,
-- converted once from the club's local wall time.
--
-- Idempotent: safe to re-run.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS kickoff_at timestamptz;

--> statement-breakpoint

-- Backfill: interpret "<played_on> <match_time>" as Europe/Warsaw wall time.
-- to_timestamp(...)::timestamp strips the session offset, leaving naive local
-- time; AT TIME ZONE then anchors it to the club's zone.
UPDATE matches
   SET kickoff_at = (
         to_timestamp(
           played_on || ' ' || COALESCE(NULLIF(btrim(match_time), ''), '09:00 pm'),
           'YYYY-MM-DD HH12:MI am'
         )::timestamp
       ) AT TIME ZONE 'Europe/Warsaw'
 WHERE kickoff_at IS NULL
   AND played_on IS NOT NULL;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS matches_kickoff_at_idx ON matches (kickoff_at);
