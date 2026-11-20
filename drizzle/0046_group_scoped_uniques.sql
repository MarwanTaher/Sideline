-- M1 (docs/platform/01-M1-TENANCY-FOUNDATION.md §6): uniqueness that was
-- global becomes per group.
--
-- The old constraints stay for now, next to the new ones, so the currently
-- deployed code (ON CONFLICT (name), ON CONFLICT (snapshot_key), ...) keeps
-- working; with one group the two are equivalent. M2 drops the old ones
-- together with the DEFAULT 1 on group_id.
--
-- score_cache_state: one revision row per group instead of the singleton.
-- The legacy id column stays (always 1) so code that still reads WHERE id = 1
-- keeps finding the founding group's row until it is replaced.
--
-- Additive and idempotent: safe to re-run.

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_group_id_name_key') THEN
		ALTER TABLE players ADD CONSTRAINT players_group_id_name_key UNIQUE (group_id, name);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_group_id_username_key') THEN
		ALTER TABLE admins ADD CONSTRAINT admins_group_id_username_key UNIQUE (group_id, username);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'award_overrides_group_scope_award_key') THEN
		ALTER TABLE award_overrides ADD CONSTRAINT award_overrides_group_scope_award_key UNIQUE (group_id, scope_key, award_type);
	END IF;
END $$;
--> statement-breakpoint

-- score_cache_state: PRIMARY KEY (group_id); id becomes a legacy constant.
ALTER TABLE score_cache_state ALTER COLUMN id SET DEFAULT 1;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'score_cache_state'::regclass AND contype = 'p'
		  AND pg_get_constraintdef(oid) = 'PRIMARY KEY (group_id)'
	) THEN
		ALTER TABLE score_cache_state DROP CONSTRAINT IF EXISTS score_cache_state_pkey;
		ALTER TABLE score_cache_state ADD CONSTRAINT score_cache_state_pkey PRIMARY KEY (group_id);
	END IF;
END $$;
--> statement-breakpoint

-- score_cache_snapshots: keyed per group; transitional (snapshot_key) index for deployed code.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'score_cache_snapshots'::regclass AND contype = 'p'
		  AND pg_get_constraintdef(oid) = 'PRIMARY KEY (group_id, snapshot_key)'
	) THEN
		ALTER TABLE score_cache_snapshots DROP CONSTRAINT IF EXISTS score_cache_snapshots_pkey;
		ALTER TABLE score_cache_snapshots ADD CONSTRAINT score_cache_snapshots_pkey PRIMARY KEY (group_id, snapshot_key);
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS score_cache_snapshots_key_transitional ON score_cache_snapshots (snapshot_key);
