-- Phase 3: record the current rate-change date and explicit go-live checks.
-- The migration is intentionally not applied by this change.

ALTER TABLE seasons
    ADD COLUMN IF NOT EXISTS rates_changed_at timestamptz;

--> statement-breakpoint

ALTER TABLE seasons
    ADD COLUMN IF NOT EXISTS rates_confirmed_at timestamptz;

--> statement-breakpoint

ALTER TABLE seasons
    ADD COLUMN IF NOT EXISTS terms_final_at timestamptz;

--> statement-breakpoint

ALTER TABLE seasons
    ADD COLUMN IF NOT EXISTS test_invoice_completed_at timestamptz;

--> statement-breakpoint

ALTER TABLE seasons
    ADD COLUMN IF NOT EXISTS reminder_text_reviewed_at timestamptz;
