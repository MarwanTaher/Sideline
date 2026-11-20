import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// In-memory only. M1 RLS spike (docs/platform/01-M1-TENANCY-FOUNDATION.md §8):
// proves the policy shape M2 will roll out, under a non-owner role, with the
// transaction-scoped setting that groupSql() will set per request.

const POLICY = `
  ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
  ALTER TABLE matches FORCE ROW LEVEL SECURITY;
  CREATE POLICY group_isolation ON matches
    USING      (group_id = NULLIF(current_setting('sideline.group_id', true), '')::int)
    WITH CHECK (group_id = NULLIF(current_setting('sideline.group_id', true), '')::int);
`;

async function setup(db: PGlite) {
  await db.exec(`
    CREATE TABLE groups(id int PRIMARY KEY);
    INSERT INTO groups VALUES (1), (2);
    CREATE TABLE matches(id int PRIMARY KEY, group_id int NOT NULL REFERENCES groups(id), name text);
    INSERT INTO matches VALUES (1, 1, 'krakow'), (2, 2, 'berlin');
    CREATE FUNCTION rename_match(p int) RETURNS int LANGUAGE plpgsql AS $$
      BEGIN UPDATE matches SET name = name || '!' WHERE id = p; RETURN (SELECT count(*) FROM matches); END $$;
    CREATE ROLE sideline_app LOGIN;
    GRANT USAGE ON SCHEMA public TO sideline_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sideline_app;
  `);
  await db.exec(POLICY);
}

const ids = async (db: PGlite) => (await db.query<{ id: number }>(`SELECT id FROM matches ORDER BY id`)).rows.map((r) => r.id);

test("without the setting a non-owner role sees and writes nothing (fail closed)", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`SET ROLE sideline_app`);
    assert.deepEqual(await ids(db), []);
    await assert.rejects(db.query(`INSERT INTO matches VALUES (3, 1, 'x')`), /row-level security/);
    // A function running as the app role updates and sees no rows either.
    assert.equal((await db.query<{ n: number }>(`SELECT rename_match(1) AS n`)).rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("a transaction-scoped setting confines reads, writes and plpgsql to one group", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`SET ROLE sideline_app`);
    await db.exec(`BEGIN`);
    await db.query(`SELECT set_config('sideline.group_id', '1', true)`);
    assert.deepEqual(await ids(db), [1]);
    // A refused statement aborts the transaction, so each one runs under a savepoint.
    await db.exec(`SAVEPOINT s1`);
    await assert.rejects(db.query(`INSERT INTO matches VALUES (4, 2, 'x')`), /row-level security/, "cannot write another group's row");
    await db.exec(`ROLLBACK TO SAVEPOINT s1`);
    await db.query(`INSERT INTO matches VALUES (5, 1, 'x')`);
    assert.equal((await db.query<{ n: number }>(`SELECT rename_match(1) AS n`)).rows[0].n, 2, "plpgsql under RLS counts only group 1");
    // Updating a row into another group is refused too.
    await db.exec(`SAVEPOINT s2`);
    await assert.rejects(db.query(`UPDATE matches SET group_id = 2 WHERE id = 1`), /row-level security/);
    await db.exec(`ROLLBACK TO SAVEPOINT s2`);
    await db.exec(`COMMIT`);
    // The setting was transaction-local: gone after commit.
    assert.deepEqual(await ids(db), []);
    await db.exec(`RESET ROLE`);
    assert.deepEqual(await ids(db), [1, 2, 5], "the owner (superuser in PGlite) still sees everything");
  } finally {
    await db.close();
  }
});

test("a missing or malformed setting never widens access", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`SET ROLE sideline_app`);
    await db.exec(`BEGIN`);
    await db.query(`SELECT set_config('sideline.group_id', '', true)`);
    assert.deepEqual(await ids(db), []);
    await db.query(`SELECT set_config('sideline.group_id', '2', true)`);
    assert.deepEqual(await ids(db), [2]);
    await db.exec(`ROLLBACK`);
  } finally {
    await db.close();
  }
});
