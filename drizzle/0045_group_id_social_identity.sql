-- M1 (docs/platform/01-M1-TENANCY-FOUNDATION.md §4-5): group_id on the
-- social/recognition tables and on the per-player identity tables.
--
-- Same shape as 0043/0044. The identity tables (credentials, access tokens,
-- password resets, push subscriptions and preferences) get group_id derived
-- from their player for now; M3 moves them to accounts.
--
-- player_moments.match_id has no foreign key (0 means "no match"), so it gets
-- no composite key.
--
-- Additive and idempotent: safe to re-run.

ALTER TABLE player_achievements ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE player_kudos ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE player_moments ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE stories ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE story_reactions ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE story_views ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE admin_tab_locks ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE player_credentials ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE player_access_tokens ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE push_preferences ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint

-- stories is the parent of story_reactions / story_views.
CREATE UNIQUE INDEX IF NOT EXISTS stories_group_id_id_uq ON stories (group_id, id);
--> statement-breakpoint

SELECT sideline_add_group_fk('player_achievements', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_achievements', 'match_id', 'matches', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_achievements', 'season_id', 'seasons', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_kudos', 'from_player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_kudos', 'to_player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_moments', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('stories', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('stories', 'match_id', 'matches', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('story_reactions', 'story_id', 'stories', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('story_reactions', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('story_views', 'story_id', 'stories', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('story_views', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('admin_tab_locks', 'admin_id', 'admins', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_credentials', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('player_access_tokens', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('password_reset_requests', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('password_reset_tokens', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('push_subscriptions', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('push_preferences', 'player_id', 'players', 'CASCADE');
