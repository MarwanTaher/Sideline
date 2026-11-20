import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  MATCH_CHILDREN_BEFORE_0043, ROOTS_BEFORE_0041, SEASON_BEFORE_0044, SOCIAL_IDENTITY_BEFORE_0045, applyMigration,
} from "./helpers/tenancy-fixture";
import { GROUP_ID_TABLES } from "./helpers/tenancy-tables";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
// Covers 0046 (per-group uniqueness) and 0047 (group-aware triggers).

/** The 0031 revision triggers, on the fixture tables. */
const REVISION_TRIGGERS_0031 = `
  CREATE OR REPLACE FUNCTION bump_score_cache_revision() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    INSERT INTO score_cache_state (id, revision) VALUES (1, 2)
    ON CONFLICT (id) DO UPDATE SET revision = score_cache_state.revision + 1;
    RETURN NULL;
  END $$;
  CREATE TRIGGER score_cache_revision_votes AFTER INSERT OR UPDATE OR DELETE ON votes FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();
  CREATE TRIGGER score_cache_revision_players AFTER INSERT OR UPDATE OR DELETE ON players FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();
  CREATE TRIGGER score_cache_revision_app_settings AFTER INSERT OR UPDATE OR DELETE ON app_settings FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision();
`;

const ALL = ["0040_groups.sql", "0041_group_id_roots.sql", "0042_drop_admin_sessions.sql", "0043_group_id_match_children.sql",
  "0044_group_id_season_money.sql", "0045_group_id_social_identity.sql", "0046_group_scoped_uniques.sql", "0047_group_aware_triggers.sql"];

async function setup(db: PGlite) {
  await db.exec(ROOTS_BEFORE_0041);
  await db.exec(MATCH_CHILDREN_BEFORE_0043);
  await db.exec(SEASON_BEFORE_0044);
  await db.exec(SOCIAL_IDENTITY_BEFORE_0045);
  await db.exec(REVISION_TRIGGERS_0031);
  await applyMigration(db, "0039_payments_ledger.sql");
  for (const f of ALL) await applyMigration(db, f);
  await db.query(`INSERT INTO groups(slug, name, timezone, currency) VALUES ('berlin-bears', 'Berlin Bears', 'Europe/Berlin', 'EUR')`);
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

const one = async <T,>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const revision = async (db: PGlite, gid: number) =>
  (await one<{ r: string }>(db, `SELECT revision::text AS r FROM score_cache_state WHERE group_id = $1`, [gid]))?.r ?? null;

test("0046 and 0047 are safe to re-run", async () => {
  await withDb(async (db) => {
    await applyMigration(db, "0046_group_scoped_uniques.sql");
    await applyMigration(db, "0047_group_aware_triggers.sql");
  });
});

test("names, admin usernames and award overrides are unique per group, not globally (once the old constraints go)", async () => {
  await withDb(async (db) => {
    // The old global constraints are still there (transitional), so the same name across groups is
    // rejected today, and accepted once M2 drops them.
    await assert.rejects(db.query(`INSERT INTO players(group_id, name) VALUES (2, 'Adam')`), /players_name_key/);
    await db.query(`ALTER TABLE players DROP CONSTRAINT players_name_key`);
    await db.query(`INSERT INTO players(group_id, name) VALUES (2, 'Adam')`);
    await assert.rejects(db.query(`INSERT INTO players(group_id, name) VALUES (2, 'Adam')`), /players_group_id_name_key/);

    await db.query(`ALTER TABLE admins DROP CONSTRAINT admins_username_key`);
    await db.query(`INSERT INTO admins(group_id, username) VALUES (2, 'adam')`);
    await assert.rejects(db.query(`INSERT INTO admins(group_id, username) VALUES (2, 'adam')`), /admins_group_id_username_key/);

    await db.query(`ALTER TABLE award_overrides DROP CONSTRAINT award_overrides_award_type_scope_key_key`);
    await db.query(`INSERT INTO award_overrides(group_id, award_type, scope_key) VALUES (1, 'mvp', 'overall'), (2, 'mvp', 'overall')`);
    await assert.rejects(db.query(`INSERT INTO award_overrides(group_id, award_type, scope_key) VALUES (2, 'mvp', 'overall')`), /award_overrides_group_scope_award_key/);
    // The new-style upsert works.
    await db.query(`INSERT INTO award_overrides(group_id, award_type, scope_key) VALUES (2, 'mvp', 'overall') ON CONFLICT (group_id, scope_key, award_type) DO NOTHING`);
  });
});

test("score revision is tracked per group and the old singleton row keeps serving group 1", async () => {
  await withDb(async (db) => {
    assert.equal(await one<{ def: string }>(db, `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'score_cache_state'::regclass AND contype = 'p'`).then((r) => r.def), "PRIMARY KEY (group_id)");
    const before = await revision(db, 1);
    assert.equal(before, "7"); // fixture value survived
    assert.equal(await revision(db, 2), null);

    // A Berlin vote: creates Berlin's row, leaves Krakow's alone.
    await db.query(`INSERT INTO players(group_id, name) VALUES (2, 'Bruno'), (2, 'Britta')`);
    await db.query(`INSERT INTO matches(group_id, played_on) VALUES (2, '2026-11-15')`);
    assert.equal(await revision(db, 1), "7");
    assert.ok(Number(await revision(db, 2)) >= 2);
    const berlinBefore = Number(await revision(db, 2));
    await db.query(`INSERT INTO votes(match_id, voter_id, voted_for_id, score) VALUES (2, 3, 4, 9)`);
    assert.equal(Number(await revision(db, 2)), berlinBefore + 1);
    assert.equal(await revision(db, 1), "7");

    // Krakow scoring setting bumps only Krakow.
    await db.query(`INSERT INTO app_settings(group_id, key, value) VALUES (1, 'scoring_w_stat', '0.3')`);
    assert.equal(await revision(db, 1), "8");
    // Legacy reads still find the founding row.
    assert.equal((await one<{ r: string }>(db, `SELECT revision::text AS r FROM score_cache_state WHERE id = 1 AND group_id = 1`)).r, "8");
  });
});

test("score snapshots are keyed per group; the transitional key index still protects deployed code", async () => {
  await withDb(async (db) => {
    assert.equal((await one<{ def: string }>(db, `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'score_cache_snapshots'::regclass AND contype = 'p'`)).def, "PRIMARY KEY (group_id, snapshot_key)");
    await db.query(`INSERT INTO score_cache_snapshots(group_id, snapshot_key, revision) VALUES (1, 'match_1', 7) ON CONFLICT (group_id, snapshot_key) DO UPDATE SET revision = EXCLUDED.revision`);
    await db.query(`INSERT INTO score_cache_snapshots(snapshot_key, revision) VALUES ('match_1', 8) ON CONFLICT (snapshot_key) DO UPDATE SET revision = EXCLUDED.revision`);
    assert.equal((await one<{ r: string }>(db, `SELECT revision::text AS r FROM score_cache_snapshots WHERE group_id = 1 AND snapshot_key = 'match_1'`)).r, "8");
    await assert.rejects(db.query(`INSERT INTO score_cache_snapshots(group_id, snapshot_key, revision) VALUES (2, 'match_1', 1)`), /score_cache_snapshots_key_transitional/);
    await db.query(`DROP INDEX score_cache_snapshots_key_transitional`);
    await db.query(`INSERT INTO score_cache_snapshots(group_id, snapshot_key, revision) VALUES (2, 'match_1', 1)`);
  });
});

test("child rows inherit group_id from their parent, whatever the writer passes", async () => {
  await withDb(async (db) => {
    await db.query(`INSERT INTO players(group_id, name) VALUES (2, 'Bruno')`);
    await db.query(`INSERT INTO seasons(group_id, name) VALUES (2, 'Berlin Winter')`);
    // A match created for a Berlin season without naming the group (as the 0037 generator does).
    const m = await one<{ group_id: number; id: number }>(db, `INSERT INTO matches(played_on, season_id) VALUES ('2026-11-15', 2) RETURNING group_id, id`);
    assert.equal(m.group_id, 2);
    // Children written with the default, or even the wrong group, land in the parent's group.
    assert.equal((await one<{ g: number }>(db, `INSERT INTO match_availability(match_id, player_id, status) VALUES ($1, 3, 'in') RETURNING group_id AS g`, [m.id])).g, 2);
    assert.equal((await one<{ g: number }>(db, `INSERT INTO match_waitlist(group_id, match_id, player_id) VALUES (1, $1, 3) RETURNING group_id AS g`, [m.id])).g, 2);
    assert.equal((await one<{ g: number }>(db, `INSERT INTO season_subscriptions(season_id, player_id) VALUES (2, 3) RETURNING group_id AS g`)).g, 2);
    assert.equal((await one<{ g: number }>(db, `INSERT INTO match_automation_audit(season_id, match_id, event) VALUES (2, $1, 'x') RETURNING group_id AS g`, [m.id])).g, 2);
    assert.equal((await one<{ g: number }>(db, `INSERT INTO push_subscriptions(player_id, endpoint) VALUES (3, 'https://push.example/b') RETURNING group_id AS g`)).g, 2);
    assert.equal((await one<{ g: number }>(db, `INSERT INTO stories(player_id, expires_at) VALUES (3, now()) RETURNING group_id AS g`)).g, 2);
    assert.equal((await one<{ g: number }>(db, `INSERT INTO story_views(story_id, player_id) VALUES (2, 3) RETURNING group_id AS g`)).g, 2);
    // Ledger rows follow too: a Berlin pot match (no season) written without a group.
    const pot = await one<{ id: number; group_id: number }>(db, `INSERT INTO matches(group_id, played_on, payments_active, total_payment) VALUES (2, '2026-11-22', 1, 40) RETURNING id, group_id`);
    await db.query(`INSERT INTO match_players(match_id, player_id, team) VALUES ($1, 3, 1)`, [pot.id]);
    assert.equal((await one<{ g: number }>(db, `SELECT group_id AS g FROM dues WHERE match_id = $1`, [pot.id])).g, 2);
    // A root without a parent keeps what it was given.
    assert.equal((await one<{ g: number }>(db, `INSERT INTO matches(played_on) VALUES ('2026-12-01') RETURNING group_id AS g`)).g, 1);
    // Mismatched parents are still impossible: a Krakow player on the Berlin match.
    await assert.rejects(db.query(`INSERT INTO match_availability(match_id, player_id, status) VALUES ($1, 1, 'in')`, [m.id]), /match_availability_player_id_group_fkey/);
  });
});

test("every group-owned child table has an inherit trigger", async () => {
  await withDb(async (db) => {
    const withTrigger = (await db.query<{ t: string }>(
      `SELECT DISTINCT event_object_table AS t FROM information_schema.triggers WHERE trigger_name LIKE 'sideline\\_group\\_%' ORDER BY 1`)).rows.map((r) => r.t);
    // Roots without any parent column.
    const noParent = ["players", "seasons", "app_settings", "award_override_audit", "score_cache_state", "score_cache_snapshots", "rate_limits"];
    assert.deepEqual(withTrigger, GROUP_ID_TABLES.filter((t) => !noParent.includes(t)));
  });
});
