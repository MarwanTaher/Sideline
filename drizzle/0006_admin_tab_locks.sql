CREATE TABLE IF NOT EXISTS admin_tab_locks (
	admin_id integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
	tab_key text NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (admin_id, tab_key)
);
