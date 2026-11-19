import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.

/** The parts of the pre-0038 schema that the migration touches. */
const BEFORE_0038 = `
  CREATE TABLE seasons(id integer PRIMARY KEY, extension_cost_minor integer NOT NULL DEFAULT 10000);
  CREATE TABLE players(id integer PRIMARY KEY);
  CREATE TABLE matches(id integer PRIMARY KEY, season_id integer, extended boolean DEFAULT false,
    extension_minutes integer DEFAULT 30, extension_threshold integer);
  CREATE TABLE guest_charges(id integer PRIMARY KEY, match_id integer, amount_minor integer NOT NULL);
  CREATE TABLE season_invoices(id integer PRIMARY KEY);
  CREATE TABLE multisport_scans(id integer PRIMARY KEY, status text, applied_invoice_id integer,
    settled_at timestamptz, settled_as text,
    CONSTRAINT multisport_scans_settled_check CHECK (
      (settled_at IS NULL AND settled_as IS NULL)
      OR (settled_at IS NOT NULL AND settled_as IN ('refunded', 'fund')
          AND applied_invoice_id IS NULL AND status = 'approved')));
  CREATE TABLE season_match_occurrences(match_id integer, season_id integer);
  CREATE TABLE match_automation_audit(season_id integer, match_id integer, event text, actor text);
  CREATE FUNCTION sideline_squad_count(p integer) RETURNS integer LANGUAGE sql AS $$ SELECT 20 $$;
  INSERT INTO seasons VALUES (1, 10000);
  INSERT INTO players VALUES (1);
  INSERT INTO matches(id, season_id) VALUES (10, 1), (11, NULL);
  INSERT INTO guest_charges VALUES (1, 10, 3600);
  INSERT INTO multisport_scans VALUES (1, 'approved', NULL, now(), 'fund');
`;

async function migrate(db: PGlite) {
  const sql = readFileSync(new URL("../drizzle/0038_season_payment_rules.sql", import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.query(statement);
  }
}

const rejects = async (db: PGlite, sql: string) =>
  assert.rejects(() => db.query(sql), /violates check constraint/);

test("0038 applies twice, keeps old rows valid and defaults to today's rules", async () => {
  const db = new PGlite();
  try {
    await db.exec(BEFORE_0038);
    await migrate(db);
    await migrate(db);

    const season = (await db.query<{ split_mode: string; new_rules_from: string | null }>(
      `SELECT split_mode, new_rules_from FROM seasons WHERE id = 1`,
    )).rows[0];
    assert.deepEqual(season, { split_mode: "cap", new_rules_from: null });
    const charge = (await db.query<{ scan_credit_minor: number }>(
      `SELECT scan_credit_minor FROM guest_charges WHERE id = 1`,
    )).rows[0];
    assert.equal(charge.scan_credit_minor, 0);

    await rejects(db, `UPDATE seasons SET split_mode = 'heads'`);
    await rejects(db, `UPDATE guest_charges SET scan_credit_minor = 5000`);
    await db.query(`INSERT INTO multisport_scans VALUES (2, 'approved', NULL, now(), 'fee')`);
    await rejects(db, `INSERT INTO multisport_scans VALUES (3, 'pending', NULL, now(), 'fee')`);
    await rejects(db, `INSERT INTO season_credits(season_id, player_id, credit_minor) VALUES (1, 1, 0)`);
    await db.query(`INSERT INTO season_credits(season_id, player_id, guest_charge_id, credit_minor) VALUES (1, 1, 1, 3600)`);
    await assert.rejects(
      () => db.query(`INSERT INTO season_credits(season_id, player_id, guest_charge_id, credit_minor) VALUES (1, 1, 1, 3600)`),
      /duplicate key/,
    );
  } finally {
    await db.close();
  }
});

test("0038 confirm extension snapshots that day's cost and clears it on removal", async () => {
  const db = new PGlite();
  try {
    await db.exec(BEFORE_0038);
    await migrate(db);
    const cost = async (id: number) =>
      (await db.query<{ c: number | null }>(`SELECT extension_cost_minor AS c FROM matches WHERE id = $1`, [id])).rows[0].c;

    await db.query(`SELECT sideline_confirm_extension(10, true)`);
    assert.equal(await cost(10), 10000);

    // A later rate change does not rewrite the confirmed match, even if re-confirmed.
    await db.query(`UPDATE seasons SET extension_cost_minor = 12000`);
    await db.query(`SELECT sideline_confirm_extension(10, true)`);
    assert.equal(await cost(10), 10000);

    await db.query(`SELECT sideline_confirm_extension(10, false)`);
    assert.equal(await cost(10), null);
    await db.query(`SELECT sideline_confirm_extension(10, true)`);
    assert.equal(await cost(10), 12000);

    // Outside a season there is no rate to snapshot.
    await db.query(`SELECT sideline_confirm_extension(11, true)`);
    assert.equal(await cost(11), null);
  } finally {
    await db.close();
  }
});
