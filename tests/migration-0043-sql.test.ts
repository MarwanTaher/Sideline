import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  MATCH_CHILDREN_BEFORE_0043, ROOTS_BEFORE_0041, applyMigration, groupForeignKeys,
} from "./helpers/tenancy-fixture";
import { TENANCY_TABLES } from "./helpers/tenancy-tables";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.

const MATCH_TABLES = Object.entries(TENANCY_TABLES).filter(([, t]) => t.area === "match").map(([n]) => n).sort();

/** Expected composite keys: table -> [column, parent, on delete][] */
const EXPECTED: Record<string, Array<[string, string, string]>> = {
  match_availability: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  match_guests: [["match_id", "matches", "CASCADE"], ["host_player_id", "players", "CASCADE"]],
  match_players: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  match_rounds: [["match_id", "matches", "CASCADE"]],
  round_goals: [["round_id", "match_rounds", "CASCADE"], ["match_id", "matches", "CASCADE"],
    ["scorer_player_id", "players", "SET NULL"], ["scorer_guest_id", "match_guests", "SET NULL"],
    ["assist_player_id", "players", "SET NULL"], ["assist_guest_id", "match_guests", "SET NULL"]],
  match_scorekeepers: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  match_waitlist: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  match_motm_votes: [["match_id", "matches", "CASCADE"], ["voter_id", "players", "CASCADE"], ["voted_for_id", "players", "CASCADE"]],
  match_reactions: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  matchday_settlements: [["match_id", "matches", "CASCADE"]],
  votes: [["match_id", "matches", "CASCADE"], ["voter_id", "players", "CASCADE"], ["voted_for_id", "players", "CASCADE"]],
  vote_skips: [["match_id", "matches", "CASCADE"], ["voter_id", "players", "CASCADE"], ["skipped_player_id", "players", "CASCADE"]],
  vote_audit: [["match_id", "matches", "CASCADE"], ["voter_id", "players", "CASCADE"], ["voted_for_id", "players", "CASCADE"]],
  stats: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  stats_audit: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  player_stats_submissions: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  player_goals_claims: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  predictions: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  payments: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
  guest_charges: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"],
    ["guest_id", "match_guests", "CASCADE"], ["owed_to_player_id", "players", "SET NULL"]],
  multisport_scans: [["match_id", "matches", "CASCADE"], ["player_id", "players", "CASCADE"]],
};

async function setup(db: PGlite) {
  await applyMigration(db, "0040_groups.sql");
  await db.exec(ROOTS_BEFORE_0041);
  await applyMigration(db, "0041_group_id_roots.sql");
  await applyMigration(db, "0042_drop_admin_sessions.sql");
  await db.exec(MATCH_CHILDREN_BEFORE_0043);
  await applyMigration(db, "0043_group_id_match_children.sql");
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

test("the expectation covers exactly the match-child tables of the classification", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), MATCH_TABLES);
});

test("0043 adds group_id = 1 and validated composite foreign keys to every match-child table, and is safe to re-run", async () => {
  await withDb(async (db) => {
    await applyMigration(db, "0043_group_id_match_children.sql");
    for (const table of MATCH_TABLES) {
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

test("a row cannot point at a match, player, guest or round of another group", async () => {
  await withDb(async (db) => {
    await db.query(`INSERT INTO groups(slug, name) VALUES ('berlin-bears', 'Berlin Bears')`);
    await db.query(`INSERT INTO players(name, group_id) VALUES ('Bruno', 2)`);
    await db.query(`INSERT INTO matches(played_on, group_id) VALUES ('2026-11-09', 2)`);
    // Bruno (Berlin) cannot be "in" for the Krakow match; Adam (Krakow) cannot join the Berlin match.
    await assert.rejects(db.query(`INSERT INTO match_availability(group_id, match_id, player_id, status) VALUES (2, 1, 3, 'in')`), /match_availability_match_id_group_fkey/);
    await assert.rejects(db.query(`INSERT INTO match_availability(group_id, match_id, player_id, status) VALUES (2, 2, 1, 'in')`), /match_availability_player_id_group_fkey/);
    // Even when every id exists, the row must carry the matching group.
    await assert.rejects(db.query(`INSERT INTO match_availability(group_id, match_id, player_id, status) VALUES (1, 2, 3, 'in')`), /group_fkey/);
    await db.query(`INSERT INTO match_availability(group_id, match_id, player_id, status) VALUES (2, 2, 3, 'in')`);
    // Guests and rounds: a Berlin goal cannot credit a Krakow guest.
    await db.query(`INSERT INTO match_rounds(group_id, match_id, round_no) VALUES (2, 2, 1)`);
    await assert.rejects(db.query(`INSERT INTO round_goals(group_id, round_id, match_id, scorer_guest_id) VALUES (2, 2, 2, 1)`), /round_goals_scorer_guest_id_group_fkey/);
  });
});

test("ON DELETE SET NULL clears only the reference and keeps group_id", async () => {
  await withDb(async (db) => {
    await db.query(`DELETE FROM players WHERE id = 2`); // Ben scored the fixture goal
    const goal = (await db.query<{ group_id: number; scorer_player_id: number | null; assist_guest_id: number | null }>(
      `SELECT group_id, scorer_player_id, assist_guest_id FROM round_goals`)).rows[0];
    assert.deepEqual(goal, { group_id: 1, scorer_player_id: null, assist_guest_id: 1 });
    await db.query(`DELETE FROM match_guests WHERE id = 1`);
    const after = (await db.query<{ assist_guest_id: number | null }>(`SELECT assist_guest_id FROM round_goals`)).rows[0];
    assert.equal(after.assist_guest_id, null);
    // The guest charge for that guest cascaded away.
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM guest_charges`)).rows[0].n, 0);
  });
});

test("deleting a match cascades through the composite keys as before", async () => {
  await withDb(async (db) => {
    await db.query(`DELETE FROM matches WHERE id = 1`);
    for (const table of ["match_availability", "match_players", "match_rounds", "round_goals", "votes", "stats", "payments", "multisport_scans"]) {
      assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
    }
  });
});
