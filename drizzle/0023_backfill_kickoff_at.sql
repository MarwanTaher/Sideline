-- Backfill kickoff instants that were never written.
--
-- Matches created between 0016 running and the code that populates kickoff_at
-- being deployed were left NULL. The 24h availability lock reads a NULL as
-- "no deadline", so those matches silently had no lock at all - players could
-- change their availability right up to kickoff.
--
-- The read paths now fall back to the wall-clock columns too, so this cannot
-- recur, but existing rows still need the real value.
--
-- Idempotent: safe to re-run.

UPDATE matches
   SET kickoff_at = (
         to_timestamp(
           played_on || ' ' || COALESCE(NULLIF(btrim(match_time), ''), '09:00 pm'),
           'YYYY-MM-DD HH12:MI am'
         )::timestamp
       ) AT TIME ZONE 'Europe/Warsaw'
 WHERE kickoff_at IS NULL
   AND played_on IS NOT NULL;
