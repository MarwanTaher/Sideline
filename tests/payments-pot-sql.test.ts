import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { POT_STATE_SQL } from "../src/lib/payments-sql";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
test("pot state: season matches never report the pot as open", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE seasons(id integer PRIMARY KEY, subscription_enabled boolean);
      CREATE TABLE matches(id integer PRIMARY KEY, payments_active integer, season_id integer);
      INSERT INTO seasons VALUES (1, true), (2, false);
      INSERT INTO matches VALUES
        (10, 1, NULL),  -- normal match, pot open
        (11, 0, NULL),  -- normal match, pot closed
        (12, 1, 1),     -- subscription season match with a stale open flag
        (13, 1, 2),     -- linked to a season without subscriptions
        (14, NULL, NULL);
    `);
    const state = async (id: number) =>
      (await db.query<{ active: boolean; season: boolean }>(POT_STATE_SQL, [id])).rows[0];

    assert.deepEqual(await state(10), { active: true, season: false });
    assert.deepEqual(await state(11), { active: false, season: false });
    assert.deepEqual(await state(12), { active: true, season: true });
    assert.deepEqual(await state(13), { active: true, season: false });
    assert.deepEqual(await state(14), { active: false, season: false });
    assert.equal(await state(99), undefined);
  } finally {
    await db.close();
  }
});
