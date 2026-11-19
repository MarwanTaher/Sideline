import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { DECLARE_CHARGE_DUES_SQL, OPEN_DUES_SQL, PLAYER_DUES_SQL } from "../src/lib/dues-sql";
import { ledgerDb } from "./helpers/ledger-fixture";
import {
  bucketDues,
  clubToday,
  formatOwed,
  isOverdue,
  toDue,
  type DueRow,
} from "../src/lib/dues-summary";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
// Rows are written to the source tables; the 0039 triggers fill `dues`.
function fixture(): Promise<PGlite> {
  return ledgerDb(`
    INSERT INTO players VALUES (1, 'Adam'), (2, 'Ben'), (3, 'Cara');
    INSERT INTO seasons(id, subscription_enabled, new_rules_from) VALUES (1, true, NULL);
    INSERT INTO matches(id, played_on, season_id, payments_active, total_payment, payment_currency) VALUES
      (10, '2026-11-08', NULL, 1, 100, 'PLN'),  -- normal match, pot open: 3 heads → 34 each
      (11, '2026-11-15', NULL, 0, 100, 'PLN'),  -- normal match, pot closed
      (12, '2026-11-22', 1, 1, 100, 'PLN');     -- season match: pot never applies
    INSERT INTO match_players VALUES (10, 1), (10, 2), (11, 1), (12, 1), (12, 2);
    INSERT INTO payments(match_id, player_id, paid) VALUES (10, 1, 1);
    INSERT INTO match_guests(id, match_id, name, host_player_id, paid, status) VALUES
      (100, 10, 'Tom', 2, 0, 'approved'),
      (101, 10, 'Gone', 2, 0, 'rejected'),
      (102, 12, 'Uma', 1, 0, 'approved');
    INSERT INTO season_invoices(id, season_id, player_id, period, gross_minor, credit_minor, due_date,
                                paid_at, declared_paid_at, hidden_at) VALUES
      (1, 1, 1, '2026-10', 14286, 0, '2026-10-03', now(), NULL, NULL),  -- paid
      (2, 1, 1, '2026-11', 14286, 1500, '2026-11-03', NULL, now(), NULL), -- declared, 128 PLN
      (3, 1, 2, '2026-11', 14286, 0, '2026-11-03', NULL, NULL, NULL),     -- open, overdue
      (4, 1, 3, '2026-11', 14286, 0, '2026-11-03', NULL, NULL, now()),    -- hidden
      (5, 1, 3, '2026-12', 14286, 20000, '2026-12-03', NULL, NULL, NULL); -- fully credited
    INSERT INTO guest_charges(id, match_id, player_id, guest_id, amount_minor, kind, owed_to_player_id) VALUES
      (1, 12, 3, NULL, 3600, 'extra', NULL),          -- Cara → group
      (2, 12, NULL, 102, 3600, 'replacement', 1);      -- Uma (host Adam) owed to Adam: not a due
  `);
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
        // Adam paid while there were 2 heads; the ledger keeps what he paid.
        ["share:10:p1", "confirmed", 5000],
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
    // Adam's confirmed share keeps what he paid (history), not the new snapshot.
    const adam = await dues(db, PLAYER_DUES_SQL, [1]);
    assert.equal(adam.find((d) => d.key === "share:10:p1")?.amountMinor, 5000);
  } finally {
    await db.close();
  }
});

test("dues: a player declares session charges; only their own open ones change", async () => {
  const db = await fixture();
  try {
    const declare = async (player: number, keys: string[], note: string | null) =>
      (await db.query<{ due_key: string }>(DECLARE_CHARGE_DUES_SQL, [player, keys, note])).rows.map((r) => r.due_key);
    assert.deepEqual(await declare(2, ["charge:1"], "BLIK"), []);         // not Ben's
    assert.deepEqual(await declare(3, ["charge:1", "invoice:3"], "BLIK"), ["charge:1"]); // invoices go their own way
    const cara = await dues(db, PLAYER_DUES_SQL, [3]);
    assert.equal(cara.find((d) => d.key === "charge:1")?.status, "declared");
    assert.deepEqual(await declare(3, ["charge:1"], null), ["charge:1"]);   // undo
    assert.equal((await dues(db, PLAYER_DUES_SQL, [3])).find((d) => d.key === "charge:1")?.status, "open");
  } finally {
    await db.close();
  }
});

test("home admin counts come from the ledger", async () => {
  const { HOME_ADMIN_COUNTS_SQL } = await import("../src/lib/dues-sql");
  const db = await fixture();
  try {
    await db.exec(`CREATE TABLE multisport_scans(status text); INSERT INTO multisport_scans VALUES ('pending');`);
    await db.query(DECLARE_CHARGE_DUES_SQL, [3, ["charge:1"], ""]);
    const r = (await db.query<Record<string, number>>(HOME_ADMIN_COUNTS_SQL, [-1, 1])).rows[0];
    // Declared: invoice 2 and Cara's charge. Open season charges: none left.
    assert.deepEqual(r, { guests: 0, payments: 2, scans: 1, charges: 0 });
  } finally {
    await db.close();
  }
});
