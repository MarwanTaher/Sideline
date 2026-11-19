-- M1 (docs/platform/01-M1-TENANCY-FOUNDATION.md §4-6): group_id on the root
-- tables, i.e. the group-owned tables that have no group-owned parent.
--
-- Every row is backfilled to the founding group through DEFAULT 1. The default
-- is scaffolding so that code deployed today keeps inserting without naming a
-- group; M2 removes it once every insert passes group_id explicitly.
--
-- (group_id, id) unique indexes on players / matches / seasons / admins let the
-- child tables (0043-0045) add composite foreign keys, which stop a row from one
-- group pointing at a row from another.
--
-- app_settings: the primary key becomes (group_id, key). A transitional unique
-- index on (key) alone is kept so the currently deployed code, which upserts
-- with ON CONFLICT (key), keeps working until it is replaced. With one group
-- the two constraints are equivalent. M2 drops app_settings_key_transitional
-- together with the DEFAULT 1.
--
-- Deploy order: apply this before deploying code that uses ON CONFLICT
-- (group_id, key). Additive and idempotent: safe to re-run.

ALTER TABLE players ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE matches ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE admins ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE award_overrides ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE award_override_audit ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE score_cache_state ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE score_cache_snapshots ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE legacy_score_snapshots ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE legacy_defensive_stats ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint

-- Targets for composite foreign keys from child tables.
CREATE UNIQUE INDEX IF NOT EXISTS players_group_id_id_uq ON players (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS matches_group_id_id_uq ON matches (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS seasons_group_id_id_uq ON seasons (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admins_group_id_id_uq ON admins (group_id, id);
--> statement-breakpoint

-- app_settings: key is unique per group, not globally.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'app_settings'::regclass
		  AND contype = 'p'
		  AND pg_get_constraintdef(oid) = 'PRIMARY KEY (group_id, key)'
	) THEN
		ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
		ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (group_id, key);
	END IF;
END $$;
--> statement-breakpoint

-- Transitional (see header): dropped in M2.
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_key_transitional ON app_settings (key);
