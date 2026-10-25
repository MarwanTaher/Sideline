-- Leftover MultiSport credit (approved but never used on a bill, e.g. after a
-- withdrawal or the season's last bill) can be settled by an admin: refunded
-- to the player outside the app, or moved into the group fund. A settled scan
-- is never applied to a bill again.
--
-- Idempotent: safe to re-run.

ALTER TABLE multisport_scans ADD COLUMN IF NOT EXISTS settled_at timestamptz;

--> statement-breakpoint

ALTER TABLE multisport_scans ADD COLUMN IF NOT EXISTS settled_as text;

--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE multisport_scans ADD CONSTRAINT multisport_scans_settled_check
		CHECK (
			(settled_at IS NULL AND settled_as IS NULL)
			OR (settled_at IS NOT NULL AND settled_as IN ('refunded', 'fund')
			    AND applied_invoice_id IS NULL AND status = 'approved')
		);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
