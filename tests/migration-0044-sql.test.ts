import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  MATCH_CHILDREN_BEFORE_0043, ROOTS_BEFORE_0041, SEASON_BEFORE_0044, applyMigration, groupForeignKeys,
} from "./helpers/tenancy-fixture";
import { TENANCY_TABLES } from "./helpers/tenancy-tables";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
// The real 0039 ledger migration runs on the fixture, then 0040-0044 on top.

const SEASON_TABLES = Object.entries(TENANCY_TABLES).filter(([, t]) => t.area === "season").map(([n]) => n).sort();

const EXPECTED: Record<string, Array<[string, string, string, string?]>> = {
  season_subscriptions: [["season_id", "seasons", "CASCADE"], ["player_id", "players", "CASCADE"]],
  season_invoices: [["season_id", "seasons", "CASCADE"], ["player_id", "players", "CASCADE"]],
  season_credits: [["season_id", "seasons", "CASCADE"], ["player_id", "players", "CASCADE"], ["guest_charge_id", "guest_charges", "SET NULL"],
    ["match_id", "matches", "SET NULL"], ["applied_invoice_id", "season_invoices", "SET NULL"]],
  season_match_automation: [["season_id", "seasons", "RESTRICT"]],
  season_match_occurrences: [["season_id", "season_match_automation", "RESTRICT", "season_id"], ["match_id", "matches", "RESTRICT"]],
  match_automation_audit: [["season_id", "seasons", "RESTRICT"], ["match_id", "matches", "SET NULL"]],
  fund_adjustments: [["season_id", "seasons", "CASCADE"]],
  fund_entries: [["season_id", "seasons", "CASCADE"], ["match_id", "matches", "SET NULL"]],
  dues: [["payer_player_id", "players", "CASCADE"], ["payee_player_id", "players", "SET NULL"], ["match_id", "matches", "CASCADE"], ["season_id", "seasons", "CASCADE"]],
  seat_offers: [["match_id", "matches", "CASCADE"], ["subscriber_id", "players", "CASCADE"], ["replacement_player_id", "players", "SET NULL"]],
  seat_offer_requests: [["offer_id", "seat_offers", "CASCADE"], ["player_id", "players", "CASCADE"]],
};

async function setup(db: PGlite) {
  await db.exec(ROOTS_BEFORE_0041);
  await db.exec(MATCH_CHILDREN_BEFORE_0043);
  await db.exec(SEASON_BEFORE_0044);
  await applyMigration(db, "0039_payments_ledger.sql");
  for (const f of ["0040_groups.sql", "0041_group_id_roots.sql", "0042_drop_admin_sessions.sql",
    "0043_group_id_match_children.sql", "0044_group_id_season_money.sql"]) {
    await applyMigration(db, f);
  }
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

const count = async (db: PGlite, sql: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`)).rows[0].n;

test("the expectation covers exactly the season tables of the classification", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), SEASON_TABLES);
});

test("0044 adds group_id = 1 and validated composite keys to every season table, and is safe to re-run", async () => {
  await withDb(async (db) => {
    await applyMigration(db, "0044_group_id_season_money.sql");
    for (const table of SEASON_TABLES) {
      const col = (await db.query<{ is_nullable: string; column_default: string }>(
        `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 AND column_name = 'group_id'`,
        [table])).rows[0];
      assert.ok(col, `${table}.group_id missing`);
      assert.equal(col.is_nullable, "NO", table);
      assert.equal(col.column_default, "1", table);
      const fks = await groupForeignKeys(db, table);
      const expected = EXPECTED[table].map(([column, parent, onDelete, parentCol = "id"]) => {
        const action = onDelete === "SET NULL" ? `SET NULL (${column})` : onDelete;
        return `FOREIGN KEY (group_id, ${column}) REFERENCES ${parent}(group_id, ${parentCol}) ON DELETE ${action}`;
      }).sort();
      assert.deepEqual(fks.map((f) => f.def).sort(), expected, table);
      assert.ok(fks.every((f) => f.convalidated), `${table}: unvalidated constraint`);
    }
    // The deferred multisport_scans -> season_invoices key landed too.
    const scans = await groupForeignKeys(db, "multisport_scans");
    assert.ok(scans.some((f) => f.def.includes("REFERENCES season_invoices(group_id, id)")));
  });
});

test("ledger rows carry the group of their source", async () => {
  await withDb(async (db) => {
    // Krakow fixture: the 0039 backfill created dues for the invoice and the guest charge.
    assert.deepEqual((await db.query(`SELECT due_key, group_id FROM dues ORDER BY due_key`)).rows,
      [{ due_key: "charge:1", group_id: 1 }, { due_key: "invoice:1", group_id: 1 }]);

    // Berlin Bears: a season with an invoice, and a normal match with an open pot.
    await db.query(`INSERT INTO groups(slug, name, timezone, currency) VALUES ('berlin-bears', 'Berlin Bears', 'Europe/Berlin', 'EUR')`);
    await db.query(`INSERT INTO players(name, group_id) VALUES ('Bruno', 2), ('Britta', 2)`);
    await db.query(`INSERT INTO seasons(name, group_id) VALUES ('Berlin Winter', 2)`);
    await db.query(`INSERT INTO matches(played_on, group_id, payments_active, total_payment, payment_currency) VALUES ('2026-11-15', 2, 1, 40, 'EUR')`);
    await db.query(`INSERT INTO match_players(group_id, match_id, player_id, team) VALUES (2, 2, 3, 1), (2, 2, 4, 2)`);
    await db.query(`INSERT INTO season_invoices(group_id, season_id, player_id, period, gross_minor, due_date, paid_at)
                    VALUES (2, 2, 3, '2026-11', 9950, '2026-12-03', now())`);

    const dues = (await db.query<{ due_key: string; group_id: number; currency: string }>(
      `SELECT due_key, group_id, currency FROM dues WHERE group_id = 2 ORDER BY due_key`)).rows;
    assert.deepEqual(dues, [
      { due_key: "invoice:2", group_id: 2, currency: "PLN" }, // currency hardcoded in 0039; M4 moves it to the group
      { due_key: "share:2:p3", group_id: 2, currency: "EUR" },
      { due_key: "share:2:p4", group_id: 2, currency: "EUR" },
    ]);
    // Rounding surplus on the paid Berlin invoice went to the Berlin fund.
    assert.deepEqual((await db.query(`SELECT entry_key, season_id, group_id, amount_minor FROM fund_entries WHERE kind = 'rounding'`)).rows,
      [{ entry_key: "rounding:2", season_id: 2, group_id: 2, amount_minor: 50 }]);
    // Krakow rows untouched.
    assert.equal(await count(db, "dues WHERE group_id = 1"), 2);
    assert.equal(await count(db, "fund_entries WHERE group_id = 1"), 1); // the fixture adjustment
  });
});

test("season rows cannot cross groups", async () => {
  await withDb(async (db) => {
    await db.query(`INSERT INTO groups(slug, name) VALUES ('berlin-bears', 'Berlin Bears')`);
    await db.query(`INSERT INTO players(name, group_id) VALUES ('Bruno', 2)`);
    await db.query(`INSERT INTO seasons(name, group_id) VALUES ('Berlin Winter', 2)`);
    // Bruno (Berlin) cannot subscribe to the Krakow season, nor can Adam join Berlin's.
    await assert.rejects(db.query(`INSERT INTO season_subscriptions(group_id, season_id, player_id) VALUES (2, 1, 3)`), /season_subscriptions_season_id_group_fkey/);
    await assert.rejects(db.query(`INSERT INTO season_subscriptions(group_id, season_id, player_id) VALUES (1, 1, 3)`), /season_subscriptions_player_id_group_fkey/);
    await db.query(`INSERT INTO season_subscriptions(group_id, season_id, player_id) VALUES (2, 2, 3)`);
    // Automation occurrences follow the automation row's group.
    await db.query(`INSERT INTO season_match_automation(group_id, season_id) VALUES (2, 2)`);
    await assert.rejects(db.query(`INSERT INTO season_match_occurrences(group_id, season_id, local_date) VALUES (1, 2, '2026-11-22')`), /season_match_occurrences_season_id_group_fkey/);
    // A seat-offer request must be in the offer's group.
    await assert.rejects(db.query(`INSERT INTO seat_offer_requests(group_id, offer_id, player_id) VALUES (2, 1, 3)`), /seat_offer_requests_offer_id_group_fkey/);
  });
});

test("SET NULL and RESTRICT behave as before while keeping group_id", async () => {
  await withDb(async (db) => {
    await db.query(`INSERT INTO season_credits(season_id, player_id, guest_charge_id, match_id, amount_minor) VALUES (1, 2, 1, 1, 1500)`);
    await db.query(`DELETE FROM guest_charges WHERE id = 1`);
    assert.deepEqual((await db.query(`SELECT group_id, guest_charge_id, match_id FROM season_credits`)).rows, [{ group_id: 1, guest_charge_id: null, match_id: 1 }]);
    // The season has an automation row and an occurrence: RESTRICT still blocks deleting it.
    await assert.rejects(db.query(`DELETE FROM seasons WHERE id = 1`), /violates foreign key/);
  });
});
