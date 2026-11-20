-- M1 (docs/platform/01-M1-TENANCY-FOUNDATION.md §7): triggers that know
-- which group a row belongs to.
--
-- 1. sideline_inherit_group_id(): BEFORE INSERT (and UPDATE of the parent
--    column) on every child table, sets group_id from the parent row. A child
--    always belongs to its parent's group (the composite foreign keys from
--    0043-0045 require it), so every writer becomes correct at once: the code
--    deployed today, the 0037/0038 automation functions that insert matches,
--    availability, waitlist and audit rows, and future code. It also means
--    the DEFAULT 1 on child tables can be dropped in M2 without touching
--    those writers. For root tables with an optional parent (matches via
--    season_id, admins via player_id) the default stays when the parent is
--    NULL.
--
-- 2. bump_score_cache_revision(): advances the revision of the changed row's
--    group instead of the singleton row, creating the group's row on first
--    use.
--
-- Idempotent: functions are replaced and triggers re-created.

CREATE OR REPLACE FUNCTION sideline_inherit_group_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	parent_table text := TG_ARGV[0];
	ref_col text := TG_ARGV[1];
	parent_col text := COALESCE(TG_ARGV[2], 'id');
	ref_value text := to_jsonb(NEW) ->> ref_col;
	gid integer;
BEGIN
	IF ref_value IS NULL THEN RETURN NEW; END IF;
	EXECUTE format('SELECT group_id FROM %I WHERE %I = $1', parent_table, parent_col)
		INTO gid USING ref_value::integer;
	IF gid IS NOT NULL THEN NEW.group_id := gid; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint

-- Roots with an optional parent
CREATE OR REPLACE TRIGGER sideline_group_matches BEFORE INSERT OR UPDATE OF season_id ON matches
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_admins BEFORE INSERT OR UPDATE OF player_id ON admins
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_award_overrides BEFORE INSERT OR UPDATE OF match_id ON award_overrides
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_legacy_score_snapshots BEFORE INSERT OR UPDATE OF player_id ON legacy_score_snapshots
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_legacy_defensive_stats BEFORE INSERT OR UPDATE OF player_id ON legacy_defensive_stats
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint

-- Match children
CREATE OR REPLACE TRIGGER sideline_group_match_availability BEFORE INSERT OR UPDATE OF match_id ON match_availability
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_guests BEFORE INSERT OR UPDATE OF match_id ON match_guests
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_players BEFORE INSERT OR UPDATE OF match_id ON match_players
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_rounds BEFORE INSERT OR UPDATE OF match_id ON match_rounds
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_round_goals BEFORE INSERT OR UPDATE OF match_id ON round_goals
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_scorekeepers BEFORE INSERT OR UPDATE OF match_id ON match_scorekeepers
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_waitlist BEFORE INSERT OR UPDATE OF match_id ON match_waitlist
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_motm_votes BEFORE INSERT OR UPDATE OF match_id ON match_motm_votes
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_reactions BEFORE INSERT OR UPDATE OF match_id ON match_reactions
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_matchday_settlements BEFORE INSERT OR UPDATE OF match_id ON matchday_settlements
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_votes BEFORE INSERT OR UPDATE OF match_id ON votes
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_vote_skips BEFORE INSERT OR UPDATE OF match_id ON vote_skips
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_vote_audit BEFORE INSERT OR UPDATE OF match_id ON vote_audit
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_stats BEFORE INSERT OR UPDATE OF match_id ON stats
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_stats_audit BEFORE INSERT OR UPDATE OF match_id ON stats_audit
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_player_stats_submissions BEFORE INSERT OR UPDATE OF match_id ON player_stats_submissions
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_player_goals_claims BEFORE INSERT OR UPDATE OF match_id ON player_goals_claims
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_predictions BEFORE INSERT OR UPDATE OF match_id ON predictions
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_payments BEFORE INSERT OR UPDATE OF match_id ON payments
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_guest_charges BEFORE INSERT OR UPDATE OF match_id ON guest_charges
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_multisport_scans BEFORE INSERT OR UPDATE OF match_id ON multisport_scans
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint

-- Season, money and ledger
CREATE OR REPLACE TRIGGER sideline_group_season_subscriptions BEFORE INSERT OR UPDATE OF season_id ON season_subscriptions
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_season_invoices BEFORE INSERT OR UPDATE OF season_id ON season_invoices
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_season_credits BEFORE INSERT OR UPDATE OF season_id ON season_credits
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_season_match_automation BEFORE INSERT OR UPDATE OF season_id ON season_match_automation
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_season_match_occurrences BEFORE INSERT OR UPDATE OF season_id ON season_match_occurrences
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_match_automation_audit BEFORE INSERT OR UPDATE OF season_id ON match_automation_audit
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_fund_adjustments BEFORE INSERT OR UPDATE OF season_id ON fund_adjustments
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_fund_entries BEFORE INSERT OR UPDATE OF season_id ON fund_entries
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seasons', 'season_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_dues BEFORE INSERT OR UPDATE OF payer_player_id ON dues
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'payer_player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_seat_offers BEFORE INSERT OR UPDATE OF match_id ON seat_offers
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('matches', 'match_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_seat_offer_requests BEFORE INSERT OR UPDATE OF offer_id ON seat_offer_requests
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('seat_offers', 'offer_id');
--> statement-breakpoint

-- Social and identity
CREATE OR REPLACE TRIGGER sideline_group_player_achievements BEFORE INSERT OR UPDATE OF player_id ON player_achievements
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_player_kudos BEFORE INSERT OR UPDATE OF from_player_id ON player_kudos
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'from_player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_player_moments BEFORE INSERT OR UPDATE OF player_id ON player_moments
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_stories BEFORE INSERT OR UPDATE OF player_id ON stories
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_story_reactions BEFORE INSERT OR UPDATE OF story_id ON story_reactions
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('stories', 'story_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_story_views BEFORE INSERT OR UPDATE OF story_id ON story_views
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('stories', 'story_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_admin_tab_locks BEFORE INSERT OR UPDATE OF admin_id ON admin_tab_locks
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('admins', 'admin_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_player_credentials BEFORE INSERT OR UPDATE OF player_id ON player_credentials
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_player_access_tokens BEFORE INSERT OR UPDATE OF player_id ON player_access_tokens
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_password_reset_requests BEFORE INSERT OR UPDATE OF player_id ON password_reset_requests
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_password_reset_tokens BEFORE INSERT OR UPDATE OF player_id ON password_reset_tokens
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_push_subscriptions BEFORE INSERT OR UPDATE OF player_id ON push_subscriptions
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint
CREATE OR REPLACE TRIGGER sideline_group_push_preferences BEFORE INSERT OR UPDATE OF player_id ON push_preferences
	FOR EACH ROW EXECUTE FUNCTION sideline_inherit_group_id('players', 'player_id');
--> statement-breakpoint

-- Score revision per group (replaces the 0031 singleton upsert; the triggers
-- created in 0031 keep calling this function).
CREATE OR REPLACE FUNCTION bump_score_cache_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    scoring_setting boolean;
    gid integer;
BEGIN
    IF TG_TABLE_NAME = 'app_settings' THEN
        IF TG_OP = 'DELETE' THEN
            scoring_setting := OLD.key LIKE 'scoring_%';
        ELSIF TG_OP = 'INSERT' THEN
            scoring_setting := NEW.key LIKE 'scoring_%';
        ELSE
            scoring_setting := OLD.key LIKE 'scoring_%' OR NEW.key LIKE 'scoring_%';
        END IF;
        IF NOT scoring_setting THEN RETURN NULL; END IF;
    END IF;

    gid := CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END;

    INSERT INTO score_cache_state (group_id, id, revision)
    VALUES (gid, 1, 2)
    ON CONFLICT (group_id)
    DO UPDATE SET revision = score_cache_state.revision + 1;

    RETURN NULL;
END;
$$;
