-- Season payment details and player-declared payments.
--
-- Players need to know where to send the money and what reference to put on it,
-- and to be able to say "I've paid" without an admin having to guess. The
-- declaration is deliberately separate from `paid_at`: a player saying they paid
-- is not the same fact as an admin confirming the money arrived.
--
-- Idempotent: safe to re-run.

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS payment_name text DEFAULT '' NOT NULL;

--> statement-breakpoint

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS payment_account text DEFAULT '' NOT NULL;

--> statement-breakpoint

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS payment_method text DEFAULT '' NOT NULL;

--> statement-breakpoint

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS payment_note text DEFAULT '' NOT NULL;

--> statement-breakpoint

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS pay_link text DEFAULT '' NOT NULL;

--> statement-breakpoint

-- What the player claims, pending an admin confirming receipt.
ALTER TABLE season_invoices ADD COLUMN IF NOT EXISTS declared_paid_at timestamptz;

--> statement-breakpoint

ALTER TABLE season_invoices ADD COLUMN IF NOT EXISTS declared_note text DEFAULT '' NOT NULL;
