-- Matchday console follow-ups:
--   1. Per-match scorekeepers: admins can grant specific players permission to
--      run the live matchday console for a match without being admins.
--   2. Own goals: a round goal can be logged with no attributed scorer; it still
--      counts on the scoreboard for the benefiting team but feeds no player stat.

CREATE TABLE IF NOT EXISTS match_scorekeepers (
    match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_scorekeepers_player
    ON match_scorekeepers(player_id);

ALTER TABLE round_goals
    ADD COLUMN IF NOT EXISTS is_own_goal SMALLINT NOT NULL DEFAULT 0;
