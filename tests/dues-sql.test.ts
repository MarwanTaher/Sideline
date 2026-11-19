import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { OPEN_DUES_SQL, PLAYER_DUES_SQL } from "../src/lib/dues-sql";
import {
  bucketDues,
  clubToday,
  formatOwed,
  isOverdue,
  toDue,
  type DueRow,
} from "../src/lib/dues-summary";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
async function fixture(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE players(id integer PRIMARY KEY, name text);
    CREATE TABLE seasons(id integer PRIMARY KEY, subscription_enabled boolean, new_rules_from text);
    CREATE TABLE matches(id integer PRIMARY KEY, played_on text, season_id integer,
      payments_active integer, total_payment double precision, payment_currency text,
      share_minor integer);
    CREATE TABLE match_players(match_id integer, player_id integer);
    CREATE TABLE payments(match_id integer, player_id integer, paid integer, updated_at timestamp);
    CREATE TABLE match_guests(id integer PRIMARY KEY, match_id integer, name text,
      host_player_id integer, paid integer, status text);
    CREATE TABLE season_invoices(id integer PRIMARY KEY, season_id integer, player_id integer,
      period text, gross_minor integer, credit_minor integer, due_date text,
      paid_at timestamptz, declared_paid_at timestamptz, hidden_at timestamptz);
    CREATE TABLE guest_charges(id integer PRIMARY KEY, match_id integer, player_id integer,
      guest_id integer, amount_minor integer, kind text, owed_to_player_id integer,
      paid_at timestamptz);

    INSERT INTO players VALUES (1, 'Adam'), (2, 'Ben'), (3, 'Cara');
    INSERT INTO seasons VALUES (1, true, NULL);
    INSERT INTO matches VALUES
      (10, '2026-11-08', NULL, 1, 100, 'PLN', NULL),  -- normal match, pot open: 3 heads → 34 each
      (11, '2026-11-15', NULL, 0, 100, 'PLN', NULL),  -- normal match, pot closed
      (12, '2026-11-22', 1, 1, 100, 'PLN', NULL);     -- season match: pot never applies
    INSERT INTO match_players VALUES (10, 1), (10, 2), (11, 1), (12, 1), (12, 2);
    INSERT INTO payments VALUES (10, 1, 1, now());
    INSERT INTO match_guests VALUES
      (100, 10, 'Tom', 2, 0, 'approved'),
      (101, 10, 'Gone', 2, 0, 'rejected'),
      (102, 12, 'Uma', 1, 0, 'approved');
    INSERT INTO season_invoices VALUES
      (1, 1, 1, '2026-10', 14286, 0, '2026-10-03', now(), NULL, NULL),  -- paid
      (2, 1, 1, '2026-11', 14286, 1500, '2026-11-03', NULL, now(), NULL), -- declared, 128 PLN
      (3, 1, 2, '2026-11', 14286, 0, '2026-11-03', NULL, NULL, NULL),     -- open, overdue
      (4, 1, 3, '2026-11', 14286, 0, '2026-11-03', NULL, NULL, now()),    -- hidden
      (5, 1, 3, '2026-12', 14286, 20000, '2026-12-03', NULL, NULL, NULL); -- fully credited
    INSERT INTO guest_charges VALUES
      (1, 12, 3, NULL, 3600, 'extra', NULL, NULL),          -- Cara → group
      (2, 12, NULL, 102, 3600, 'replacement', 1, NULL);      -- Uma (host Adam) owed to Adam: not a due
  `);
  return db;
}

async function dues(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<DueRow>(sql, params)).rows.map(toDue);
}

test("dues: one shape across pot shares, invoices and charges", async () => {
  const db = await fixture();
  try {
    const ben = await dues(db, PLAYER_DUES_SQL, [2]);
    assert.deepEqual(
      ben.map((d) => [d.key, d.source, d.amountMinor, d.status, d.guestName]),
      [
        ["share:10:g100", "match_share", 3400, "open", "Tom"],
        ["share:10:p2", "match_share", 3400, "open", null],
        ["invoice:3", "season_invoice", 14300, "open", null],
      ],
    );

    const adam = await dues(db, PLAYER_DUES_SQL, [1]);
    assert.deepEqual(
      adam.map((d) => [d.key, d.status, d.amountMinor]),
      [
        ["share:10:p1", "confirmed", 3400],
        ["invoice:2", "declared", 12800],
        ["invoice:1", "confirmed", 14300],
      ],
    );

    const cara = await dues(db, PLAYER_DUES_SQL, [3]);
    assert.deepEqual(cara.map((d) => [d.key, d.source, d.payee, d.seasonId]), [
      ["charge:1", "session_fee", "group", 1],
    ]);
  } finally {
    await db.close();
  }
});

test("dues: the admin inbox lists everything not yet confirmed, oldest first", async () => {
  const db = await fixture();
  try {
    const open = await dues(db, OPEN_DUES_SQL);
    assert.deepEqual(open.map((d) => d.key), [
      "invoice:2",
      "invoice:3",
      "share:10:g100",
      "share:10:p2",
      "charge:1",
    ]);
  } finally {
    await db.close();
  }
});

test("dues: buckets, overdue and owed totals", async () => {
  const db = await fixture();
  try {
    const all = await dues(db, OPEN_DUES_SQL);
    const b = bucketDues(all, "2026-11-10");
    assert.deepEqual(b.waiting.map((d) => d.key), ["invoice:2"]);
    assert.deepEqual(b.overdue.map((d) => d.key), ["invoice:3", "share:10:g100", "share:10:p2"]);
    assert.equal(b.owedByCurrency.PLN, 14300 + 3400 + 3400 + 3600);
    assert.equal(formatOwed({ PLN: 17900, EUR: 2000 }), "179.00 PLN + 20.00 EUR");
    assert.equal(formatOwed({}), "");
    // The due day itself is not overdue.
    assert.equal(isOverdue(b.toPay.find((d) => d.key === "charge:1")!, "2026-11-22"), false);
  } finally {
    await db.close();
  }
});

test("clubToday uses Warsaw time", () => {
  assert.equal(clubToday(new Date("2026-11-19T23:30:00Z")), "2026-11-20");
  assert.equal(clubToday(new Date("2026-11-19T12:00:00Z")), "2026-11-19");
});

test("parseDueKey round-trips every key shape and rejects junk", async () => {
  const { parseDueKey } = await import("../src/lib/dues-summary");
  assert.deepEqual(parseDueKey("invoice:3"), { kind: "invoice", id: 3 });
  assert.deepEqual(parseDueKey("charge:7"), { kind: "charge", id: 7 });
  assert.deepEqual(parseDueKey("share:10:p2"), { kind: "share", matchId: 10, playerId: 2 });
  assert.deepEqual(parseDueKey("share:10:g100"), { kind: "guest_share", matchId: 10, guestId: 100 });
  for (const bad of ["", "invoice:0", "invoice:-1", "invoice:1;DROP", "share:10:x2", "charge:"]) {
    assert.equal(parseDueKey(bad), null, bad);
  }
});

test("dues: a finalized pot share wins over the roster split", async () => {
  const db = await fixture();
  try {
    await db.exec(`UPDATE matches SET share_minor = 5000 WHERE id = 10`);
    const ben = await dues(db, PLAYER_DUES_SQL, [2]);
    assert.deepEqual(ben.filter((d) => d.source === "match_share").map((d) => d.amountMinor), [5000, 5000]);
  } finally {
    await db.close();
  }
});
