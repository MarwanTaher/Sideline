-- Hide a season from players until it is ready.
--
-- Defaults to false so anything already created becomes invisible immediately:
-- a draft season that is live by accident is the problem this fixes, so the
-- safe default is the private one.
--
-- Admins always see it, in order to test it.
--
-- Idempotent: safe to re-run.

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS visible_to_players boolean DEFAULT false NOT NULL;
