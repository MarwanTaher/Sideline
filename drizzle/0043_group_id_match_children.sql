-- M1 (docs/platform/01-M1-TENANCY-FOUNDATION.md §4-5): group_id on the
-- match-child tables, plus composite foreign keys.
--
-- Each child row gets group_id (DEFAULT 1 = Krakow Pyramids, scaffolding until
-- M2) and a foreign key (group_id, <parent_id>) -> parent (group_id, id) next
-- to its existing single-column foreign key. The composite key is what stops
-- a row from one group pointing at a match, player, guest or round of another.
-- The single-column keys stay until the M2 contract step.
--
-- ON DELETE SET NULL uses the column-list form (PostgreSQL 15+) so a deleted
-- parent nulls only the reference, never group_id.
--
-- sideline_add_group_fk() is reused by 0044 and 0045. Additive and idempotent:
-- a constraint is added NOT VALID only when missing, then validated (a no-op
-- when already valid).

CREATE OR REPLACE FUNCTION sideline_add_group_fk(
	child regclass, child_col text, parent regclass, on_delete text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	child_name text := (SELECT relname FROM pg_class WHERE oid = child);
	cname text := format('%s_%s_group_fkey', child_name, child_col);
	action text := CASE
		WHEN upper(on_delete) = 'CASCADE' THEN 'CASCADE'
		WHEN upper(on_delete) = 'SET NULL' THEN format('SET NULL (%I)', child_col)
		ELSE 'NO ACTION'
	END;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = child AND conname = cname) THEN
		EXECUTE format(
			'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (group_id, %I) REFERENCES %s (group_id, id) ON DELETE %s NOT VALID',
			child, cname, child_col, parent, action
		);
	END IF;
	EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', child, cname);
END $$;
--> statement-breakpoint

ALTER TABLE match_availability ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_guests ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE round_goals ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_scorekeepers ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_waitlist ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_motm_votes ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_reactions ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE matchday_settlements ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE votes ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE vote_skips ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE vote_audit ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE stats ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE stats_audit ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE player_stats_submissions ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE player_goals_claims ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE guest_charges ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE multisport_scans ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint

-- match_guests and match_rounds are parents of round_goals / guest_charges.
CREATE UNIQUE INDEX IF NOT EXISTS match_guests_group_id_id_uq ON match_guests (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS match_rounds_group_id_id_uq ON match_rounds (group_id, id);
--> statement-breakpoint

SELECT sideline_add_group_fk('match_availability', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_availability', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_guests', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_guests', 'host_player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_players', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_players', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_rounds', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('round_goals', 'round_id', 'match_rounds', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('round_goals', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('round_goals', 'scorer_player_id', 'players', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('round_goals', 'scorer_guest_id', 'match_guests', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('round_goals', 'assist_player_id', 'players', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('round_goals', 'assist_guest_id', 'match_guests', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_scorekeepers', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_scorekeepers', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_waitlist', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_waitlist', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_motm_votes', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_motm_votes', 'voter_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_motm_votes', 'voted_for_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_reactions', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_reactions', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('matchday_settlements', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('votes', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('votes', 'voter_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('votes', 'voted_for_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('vote_skips', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('vote_skips', 'voter_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('vote_skips', 'skipped_player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('vote_audit', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('vote_audit', 'voter_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('vote_audit', 'voted_for_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('stats', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('stats', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('stats_audit', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('stats_audit', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_stats_submissions', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_stats_submissions', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_goals_claims', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_goals_claims', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('predictions', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('predictions', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('payments', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('payments', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('guest_charges', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('guest_charges', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('guest_charges', 'guest_id', 'match_guests', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('guest_charges', 'owed_to_player_id', 'players', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('multisport_scans', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('multisport_scans', 'player_id', 'players', 'CASCADE');
-- multisport_scans.applied_invoice_id -> season_invoices follows in 0044, once
-- season_invoices has group_id.
