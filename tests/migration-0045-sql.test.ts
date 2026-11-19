import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  MATCH_CHILDREN_BEFORE_0043, ROOTS_BEFORE_0041, SEASON_BEFORE_0044, SOCIAL_IDENTITY_BEFORE_0045,
  applyMigration, groupForeignKeys,
} from "./helpers/tenancy-fixture";
import { GROUP_ID_TABLES, TENANCY_TABLES } from "./helpers/tenancy-tables";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.

const TABLES = Object.entries(TENANCY_TABLES)
  .filter(([, t]) => t.area === "social" || t.area === "identity").map(([n]) => n).sort();

const EXPECTED: Record<string, Array<[string, string, string]>> = {
  player_achievements: [["player_id", "players", "CASCADE"], ["match_id", "matches", "SET NULL"], ["season_id", "seasons", "SET NULL"]],
  player_kudos: [["from_player_id", "players", "CASCADE"], ["to_player_id", "players", "CASCADE"]],
  player_moments: [["player_id", "players", "CASCADE"]],
  stories: [["player_id", "players", "CASCADE"], ["match_id", "matches", "SET NULL"]],
  story_reactions: [["story_id", "stories", "CASCADE"], ["player_id", "players", "CASCADE"]],
  story_views: [["story_id", "stories", "CASCADE"], ["player_id", "players", "CASCADE"]],
  admin_tab_locks: [["admin_id", "admins", "CASCADE"]],
  player_credentials: [["player_id", "players", "CASCADE"]],
  player_access_tokens: [["player_id", "players", "CASCADE"]],
  password_reset_requests: [["player_id", "players", "CASCADE"]],
  password_reset_tokens: [["player_id", "players", "CASCADE"]],
  push_subscriptions: [["player_id", "players", "CASCADE"]],
  push_preferences: [["player_id", "players", "CASCADE"]],
};

export const ALL_M1_MIGRATIONS = ["0040_groups.sql", "0041_group_id_roots.sql", "0042_drop_admin_sessions.sql",
  "0043_group_id_match_children.sql", "0044_group_id_season_money.sql", "0045_group_id_social_identity.sql"];

async function setup(db: PGlite) {
  await db.exec(ROOTS_BEFORE_0041);
  await db.exec(MATCH_CHILDREN_BEFORE_0043);
  await db.exec(SEASON_BEFORE_0044);
  await db.exec(SOCIAL_IDENTITY_BEFORE_0045);
  await applyMigration(db, "0039_payments_ledger.sql");
  for (const f of ALL_M1_MIGRATIONS) await applyMigration(db, f);
}

async function withDb(fn: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  try {
    await setup(db);
    await fn(db);
  } finally {
    await db.close();
  }
}

test("the expectation covers exactly the social and identity tables of the classification", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), TABLES);
});

test("0045 adds group_id = 1 and validated composite keys, and is safe to re-run", async () => {
  await withDb(async (db) => {
    await applyMigration(db, "0045_group_id_social_identity.sql");
    for (const table of TABLES) {
      const col = (await db.query<{ is_nullable: string; column_default: string }>(
        `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 AND column_name = 'group_id'`,
        [table])).rows[0];
      assert.ok(col, `${table}.group_id missing`);
      assert.equal(col.is_nullable, "NO", table);
      assert.equal(col.column_default, "1", table);
      const fks = await groupForeignKeys(db, table);
      const expected = EXPECTED[table].map(([column, parent, onDelete]) => {
        const action = onDelete === "SET NULL" ? `SET NULL (${column})` : onDelete;
        return `FOREIGN KEY (group_id, ${column}) REFERENCES ${parent}(group_id, id) ON DELETE ${action}`;
      }).sort();
      assert.deepEqual(fks.map((f) => f.def).sort(), expected, table);
      assert.ok(fks.every((f) => f.convalidated), `${table}: unvalidated constraint`);
    }
  });
});

test("after 0040-0045 every group-owned table has group_id (catalog check)", async () => {
  await withDb(async (db) => {
    const withColumn = (await db.query<{ table_name: string }>(
      `SELECT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.column_name = 'group_id' AND c.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY 1`)).rows.map((r) => r.table_name);
    const expected = GROUP_ID_TABLES.filter((t) => t !== "rate_limits");
    assert.deepEqual(withColumn, expected);
    // Platform tables have none.
    assert.ok(!withColumn.includes("groups") && !withColumn.includes("app_errors"));
  });
});

test("social and identity rows cannot cross groups", async () => {
  await withDb(async (db) => {
    await db.query(`INSERT INTO groups(slug, name) VALUES ('berlin-bears', 'Berlin Bears')`);
    await db.query(`INSERT INTO players(name, group_id) VALUES ('Bruno', 2)`);
    await assert.rejects(db.query(`INSERT INTO player_kudos(group_id, from_player_id, to_player_id) VALUES (2, 3, 1)`), /player_kudos_to_player_id_group_fkey/);
    await assert.rejects(db.query(`INSERT INTO story_views(group_id, story_id, player_id) VALUES (2, 1, 3)`), /story_views_story_id_group_fkey/);
    await assert.rejects(db.query(`INSERT INTO push_subscriptions(group_id, player_id, endpoint) VALUES (1, 3, 'https://push.example/x')`), /push_subscriptions_player_id_group_fkey/);
    await db.query(`INSERT INTO push_subscriptions(group_id, player_id, endpoint) VALUES (2, 3, 'https://push.example/x')`);
  });
});

test("deleting a player cascades identity rows and nulls achievement references as before", async () => {
  await withDb(async (db) => {
    await db.query(`DELETE FROM season_match_occurrences WHERE match_id = 1`); // RESTRICT, by design
    await db.query(`DELETE FROM matches WHERE id = 1`);
    assert.deepEqual((await db.query(`SELECT group_id, match_id, season_id FROM player_achievements`)).rows, [{ group_id: 1, match_id: null, season_id: 1 }]);
    await db.query(`DELETE FROM players WHERE id = 1`);
    for (const t of ["player_credentials", "push_subscriptions", "push_preferences", "stories", "story_views", "player_achievements"]) {
      assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n, 0, t);
    }
  });
});
