-- Make the core-group cap race-proof.
--
-- The cap was previously checked with a COUNT(*) inside the INSERT's WHERE
-- clause. Under READ COMMITTED every concurrent statement sees the same
-- pre-insert count, so a simultaneous rush could overshoot the cap - verified
-- in practice: 16 rows landed against a cap of 14.
--
-- Each active subscription now holds a numbered seat, unique per season. Two
-- players racing for the same seat means one hits the unique index and retries
-- onto the next free seat, so the cap holds however the requests interleave.
-- The index is partial, so withdrawing frees the seat for someone else.
--
-- Idempotent: safe to re-run.

ALTER TABLE season_subscriptions ADD COLUMN IF NOT EXISTS seat_no integer;

--> statement-breakpoint

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY season_id ORDER BY accepted_at, id) AS rn
      FROM season_subscriptions
     WHERE status = 'active'
)
UPDATE season_subscriptions ss
   SET seat_no = ranked.rn
  FROM ranked
 WHERE ss.id = ranked.id
   AND ss.seat_no IS NULL;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS season_subscriptions_seat_idx
    ON season_subscriptions (season_id, seat_no)
    WHERE status = 'active';
