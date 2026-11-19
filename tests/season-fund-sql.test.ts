import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PLAYER_CHARGES_SQL } from "../src/lib/season-fund-sql";

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
