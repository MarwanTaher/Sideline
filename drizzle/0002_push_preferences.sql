CREATE TABLE IF NOT EXISTS push_preferences (
        player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        type_key text NOT NULL,
        enabled integer DEFAULT 1 NOT NULL,
        updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (player_id, type_key)
);

CREATE INDEX IF NOT EXISTS idx_push_preferences_player_id ON push_preferences (player_id);
