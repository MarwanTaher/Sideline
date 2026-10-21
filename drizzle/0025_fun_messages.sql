-- Per-player opt-out for light-hearted "bummer" messages after a bad game.
-- On by default (decided with the group); players can switch it off in Profile.
--
-- Idempotent: safe to re-run.

ALTER TABLE players ADD COLUMN IF NOT EXISTS fun_messages boolean DEFAULT true NOT NULL;
