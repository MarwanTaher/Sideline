-- Admins can hide a season invoice from the player (e.g. a test or waived
-- bill). A hidden invoice is not shown to the player, not reminded and not
-- listed as owed; admins still see it in Billing with a "hidden" badge.
--
-- Idempotent: safe to re-run.

ALTER TABLE season_invoices ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
