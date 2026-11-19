import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { DELETE_STALE_CHARGES_SQL, PLAYER_CHARGES_SQL } from "../src/lib/season-fund-sql";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
async function fixture(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE players(id integer PRIMARY KEY, name text);
    CREATE TABLE matches(id integer PRIMARY KEY, played_on text);
    CREATE TABLE match_guests(id integer PRIMARY KEY, match_id integer, name text, host_player_id integer);
    CREATE TABLE guest_charges(
      id integer PRIMARY KEY, match_id integer, player_id integer, guest_id integer,
      amount_minor integer, kind text, owed_to_player_id integer, paid_at timestamptz);
    INSERT INTO players VALUES (1, 'Adam'), (2, 'Ben'), (3, 'Cara');
    INSERT INTO matches VALUES (10, '2026-11-16'), (11, '2026-11-23');
    INSERT INTO match_guests VALUES
      (100, 11, 'Tom', 2),   -- Ben's guest, covering Adam
      (101, 11, 'Uma', 1);   -- Adam's guest, covering Adam himself
    INSERT INTO guest_charges VALUES
      (1, 10, 2, NULL, 3600, 'extra', NULL, now()),      -- Ben, paid
      (2, 11, 2, NULL, 3600, 'extra', NULL, NULL),       -- Ben, unpaid
      (3, 11, NULL, 100, 3600, 'replacement', 1, NULL),  -- Tom (host Ben) owes Adam
      (4, 11, NULL, 101, 3600, 'replacement', 1, NULL),  -- Uma (host Adam) owes Adam
      (5, 11, 3, NULL, 3600, 'extra', NULL, NULL);       -- Cara
  `);
  return db;
}

async function ids(db: PGlite, playerId: number, matchId: number | null, unpaidOnly: boolean) {
  const res = await db.query<{ id: number }>(PLAYER_CHARGES_SQL, [playerId, matchId, unpaidOnly]);
  return res.rows.map((r) => Number(r.id));
}

test("player charges: own charges plus hosted guests, newest match first", async () => {
  const db = await fixture();
  try {
    assert.deepEqual(await ids(db, 2, null, false), [2, 3, 1]);
    assert.deepEqual(await ids(db, 3, null, false), [5]);
  } finally {
    await db.close();
  }
});

test("player charges: filter by match and unpaid", async () => {
  const db = await fixture();
  try {
    assert.deepEqual(await ids(db, 2, 10, false), [1]);
    assert.deepEqual(await ids(db, 2, null, true), [2, 3]);
    assert.deepEqual(await ids(db, 2, 10, true), []);
  } finally {
    await db.close();
  }
});

test("player charges: a replacement owed to yourself is not a debt", async () => {
  const db = await fixture();
  try {
    assert.deepEqual(await ids(db, 1, null, false), []);
  } finally {
    await db.close();
  }
});

test("sync charges: removes only unpaid charges that no longer apply", async () => {
  const db = await fixture();
  try {
    // Match 11 now: Cara (3) still IN non-core; Ben (2) dropped OUT; Tom (100)
    // still approved; Uma (101) no longer approved.
    const removed = await db.query<{ id: number }>(
      DELETE_STALE_CHARGES_SQL,
      [11, [3], [100]],
    );
    assert.deepEqual(removed.rows.map((r) => Number(r.id)).sort(), [2, 4]);

    const left = await db.query<{ id: number }>(`SELECT id FROM guest_charges ORDER BY id`);
    assert.deepEqual(left.rows.map((r) => Number(r.id)), [1, 3, 5]);

    // Paid charges stay even when the player no longer qualifies.
    const none = await db.query(
      DELETE_STALE_CHARGES_SQL,
      [10, [], []],
    );
    assert.equal(none.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("fund balance: extensions use the snapshotted cost, falling back to the rate", async () => {
  const { FUND_BALANCE_SQL } = await import("../src/lib/season-fund-sql");
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE seasons(id integer PRIMARY KEY, extension_cost_minor integer);
      CREATE TABLE matches(id integer PRIMARY KEY, season_id integer, extended boolean, extension_cost_minor integer);
      CREATE TABLE season_invoices(season_id integer, gross_minor integer, paid_at timestamptz);
      CREATE TABLE guest_charges(match_id integer, kind text, amount_minor integer, scan_credit_minor integer DEFAULT 0, paid_at timestamptz);
      CREATE TABLE fund_adjustments(season_id integer, amount_minor integer);
      CREATE TABLE matchday_settlements(match_id integer, expected_minor integer, paid_minor integer);
      INSERT INTO seasons VALUES (1, 12000);
      INSERT INTO matches VALUES
        (1, 1, true, 10000),   -- confirmed at the old 100 PLN rate
        (2, 1, true, NULL),    -- confirmed before 0038: current rate
        (3, 1, false, NULL);
    `);
    const r = (await db.query<{ extensions: number }>(FUND_BALANCE_SQL, [1])).rows[0];
    assert.equal(r.extensions, 22000);
  } finally {
    await db.close();
  }
});

test("matchday settlement: expected bill, record, correct, and fund difference", async () => {
  const sql = await import("../src/lib/season-fund-sql");
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE seasons(id integer PRIMARY KEY, subscription_enabled boolean, day_rate_minor integer, extension_cost_minor integer);
      CREATE TABLE matches(id integer PRIMARY KEY, season_id integer, extended boolean, extension_cost_minor integer);
      CREATE TABLE multisport_scans(match_id integer, status text, credit_minor integer);
      CREATE TABLE matchday_settlements(match_id integer PRIMARY KEY, expected_minor integer, paid_minor integer,
        approved_scans integer, facility_scans integer, note text, recorded_by text, recorded_at timestamptz);
      CREATE TABLE season_invoices(season_id integer, gross_minor integer, paid_at timestamptz);
      CREATE TABLE guest_charges(match_id integer, kind text, amount_minor integer, scan_credit_minor integer DEFAULT 0, paid_at timestamptz);
      CREATE TABLE fund_adjustments(season_id integer, amount_minor integer);
      INSERT INTO seasons VALUES (1, true, 50000, 12000);
      INSERT INTO matches VALUES (10, 1, true, 10000), (11, NULL, false, NULL);
      INSERT INTO multisport_scans VALUES (10, 'approved', 1500), (10, 'approved', 1500), (10, 'pending', 1500);
    `);
    const expected = (await db.query<{ expected_minor: number; approved_scans: number }>(
      sql.EXPECTED_FACILITY_BILL_SQL, [10])).rows[0];
    // 500 + 100 (snapshotted, not today's 120) − 2 × 15
    assert.deepEqual(expected, { expected_minor: 57000, approved_scans: 2 });
    assert.equal((await db.query(sql.EXPECTED_FACILITY_BILL_SQL, [11])).rows.length, 0);

    await db.query(sql.RECORD_SETTLEMENT_SQL, [10, 55500, 3, "", "admin"]);
    await db.query(sql.RECORD_SETTLEMENT_SQL, [10, 56000, 3, "corrected", "admin"]);
    const saved = (await db.query<{ paid_minor: number; note: string }>(
      `SELECT paid_minor, note FROM matchday_settlements`)).rows;
    assert.deepEqual(saved, [{ paid_minor: 56000, note: "corrected" }]);
    assert.equal((await db.query(sql.RECORD_SETTLEMENT_SQL, [11, 100, null, "", "admin"])).rows.length, 0);

    const fund = (await db.query<{ facility_difference: number; extensions: number }>(
      sql.FUND_BALANCE_SQL, [1])).rows[0];
    assert.equal(fund.facility_difference, 1000);
    assert.equal(fund.extensions, 10000);
  } finally {
    await db.close();
  }
});
