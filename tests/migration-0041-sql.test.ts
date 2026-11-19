import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ROOTS_BEFORE_0041, applyMigration } from "./helpers/tenancy-fixture";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.

const ROOT_TABLES = [
  "players", "matches", "seasons", "admins", "app_settings", "award_overrides", "award_override_audit",
  "score_cache_state", "score_cache_snapshots", "legacy_score_snapshots", "legacy_defensive_stats",
];

async function migrateAll(db: PGlite) {
  await applyMigration(db, "0041_group_id_roots.sql");
  await applyMigration(db, "0042_drop_admin_sessions.sql");
}

async function withDb(fn: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  try {
    await applyMigration(db, "0040_groups.sql");
    await db.exec(ROOTS_BEFORE_0041);
    await migrateAll(db);
    await fn(db);
  } finally {
    await db.close();
  }
}

test("0041 adds group_id = 1 to every root table and is safe to re-run", async () => {
  await withDb(async (db) => {
    await migrateAll(db);
    for (const table of ROOT_TABLES) {
      const col = (await db.query<{ is_nullable: string; column_default: string }>(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'group_id'`, [table])).rows[0];
      assert.ok(col, `${table}.group_id missing`);
      assert.equal(col.is_nullable, "NO", table);
      assert.equal(col.column_default, "1", table);
      const other = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE group_id <> 1`)).rows[0].n;
      assert.equal(other, 0, `${table} has rows outside the founding group`);
    }
    // Existing rows kept their data.
    assert.equal((await db.query<{ revision: string }>(`SELECT revision::text AS revision FROM score_cache_state`)).rows[0].revision, "7");
    assert.deepEqual((await db.query(`SELECT key, value FROM app_settings ORDER BY key`)).rows,
      [{ key: "scoring_w_peer", value: "0.7" }, { key: "waitlist_auto_promote", value: "1" }]);
  });
});

test("group_id rejects unknown groups", async () => {
  await withDb(async (db) => {
    await assert.rejects(db.query(`INSERT INTO players(name, group_id) VALUES ('Cara', 99)`), /foreign key/);
  });
});

test("(group_id, id) is unique on the parents of future composite foreign keys", async () => {
  await withDb(async (db) => {
    for (const table of ["players", "matches", "seasons", "admins"]) {
      const idx = (await db.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
        [table, `${table}_group_id_id_uq`])).rows[0];
      assert.ok(idx, `${table}_group_id_id_uq missing`);
      assert.match(idx.indexdef, /UNIQUE INDEX .* \(group_id, id\)/);
    }
    // A child table can now reference the pair.
    await db.exec(`CREATE TABLE child(group_id integer, match_id integer,
      FOREIGN KEY (group_id, match_id) REFERENCES matches(group_id, id))`);
    await db.query(`INSERT INTO groups(slug, name) VALUES ('berlin-bears', 'Berlin Bears')`);
    await db.query(`INSERT INTO child VALUES (1, 1)`);
    await assert.rejects(db.query(`INSERT INTO child VALUES (2, 1)`), /foreign key/, "a Berlin Bears row cannot point at a Krakow match");
  });
});

test("app_settings is keyed per group, and both old and new upserts work during the transition", async () => {
  await withDb(async (db) => {
    const pk = (await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'app_settings'::regclass AND contype = 'p'`)).rows[0].def;
    assert.equal(pk, "PRIMARY KEY (group_id, key)");

    // Deployed code (before this change) upserts on (key) alone.
    await db.query(`INSERT INTO app_settings(key, value) VALUES ('push_enabled', '0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    // New code upserts on (group_id, key).
    await db.query(`INSERT INTO app_settings(group_id, key, value) VALUES (1, 'push_enabled', '1') ON CONFLICT (group_id, key) DO UPDATE SET value = EXCLUDED.value`);
    assert.deepEqual((await db.query(`SELECT group_id, value FROM app_settings WHERE key = 'push_enabled'`)).rows, [{ group_id: 1, value: "1" }]);

    // Until M2 drops the transitional index, a second group cannot reuse a key.
    await db.query(`INSERT INTO groups(slug, name) VALUES ('berlin-bears', 'Berlin Bears')`);
    await assert.rejects(db.query(`INSERT INTO app_settings(group_id, key, value) VALUES (2, 'push_enabled', '1')`), /app_settings_key_transitional/);
    await db.query(`DROP INDEX app_settings_key_transitional`);
    await db.query(`INSERT INTO app_settings(group_id, key, value) VALUES (2, 'push_enabled', '1')`);
  });
});

test("0042 drops the unused admin_sessions table", async () => {
  await withDb(async (db) => {
    const rows = (await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_sessions'`)).rows;
    assert.equal(rows.length, 0);
  });
});
