ALTER TABLE legacy_score_snapshots
    ADD COLUMN IF NOT EXISTS revision bigint;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS score_cache_state (
    id integer PRIMARY KEY CHECK (id = 1),
    revision bigint NOT NULL DEFAULT 1
);

--> statement-breakpoint

INSERT INTO score_cache_state (id, revision)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS score_cache_snapshots (
    snapshot_key text PRIMARY KEY,
    revision bigint NOT NULL,
    player_count integer NOT NULL CHECK (player_count >= 0),
    model_version text NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS score_cache_snapshots_revision_idx
    ON score_cache_snapshots (revision, captured_at DESC);

--> statement-breakpoint

CREATE OR REPLACE FUNCTION bump_score_cache_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    scoring_setting boolean;
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

    INSERT INTO score_cache_state (id, revision)
    VALUES (1, 2)
    ON CONFLICT (id)
    DO UPDATE SET revision = score_cache_state.revision + 1;

    RETURN NULL;
END;
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_players ON players;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_players
AFTER INSERT OR UPDATE OR DELETE ON players
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_matches ON matches;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_matches
AFTER INSERT OR UPDATE OR DELETE ON matches
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_match_players ON match_players;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_match_players
AFTER INSERT OR UPDATE OR DELETE ON match_players
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_votes ON votes;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_votes
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_stats ON stats;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_stats
AFTER INSERT OR UPDATE OR DELETE ON stats
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_player_stats_submissions ON player_stats_submissions;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_player_stats_submissions
AFTER INSERT OR UPDATE OR DELETE ON player_stats_submissions
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();

--> statement-breakpoint

DROP TRIGGER IF EXISTS score_cache_revision_app_settings ON app_settings;
--> statement-breakpoint
CREATE TRIGGER score_cache_revision_app_settings
AFTER INSERT OR UPDATE OR DELETE ON app_settings
FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();
