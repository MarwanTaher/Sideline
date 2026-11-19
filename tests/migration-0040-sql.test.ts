import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { FOUNDING_GROUP } from "../src/lib/group-constants";

// In-memory fixtures only: this suite never loads DATABASE_URL or contacts Neon.
// Berlin Bears is a fictional test group and is never inserted by a migration.

async function migrate(db: PGlite) {
  const sql = readFileSync(new URL("../drizzle/0040_groups.sql", import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.query(statement);
  }
}

async function withDb(fn: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  try {
    await migrate(db);
    await fn(db);
  } finally {
    await db.close();
  }
}

test("0040 seeds the founding group with today's defaults and is safe to re-run", async () => {
  await withDb(async (db) => {
    await migrate(db);
    const rows = (await db.query(`SELECT id, slug, name, timezone, currency, locale, status FROM groups`)).rows;
    assert.deepEqual(rows, [{
      id: FOUNDING_GROUP.id, slug: FOUNDING_GROUP.slug, name: FOUNDING_GROUP.name,
      timezone: "Europe/Warsaw", currency: "PLN", locale: "en-GB", status: "active",
    }]);
  });
});

test("the next group gets id 2", async () => {
  await withDb(async (db) => {
    const r = await db.query<{ id: number }>(
      `INSERT INTO groups (slug, name, timezone, currency) VALUES ('berlin-bears', 'Berlin Bears', 'Europe/Berlin', 'EUR') RETURNING id`);
    assert.equal(r.rows[0].id, 2);
  });
});

test("re-running after other groups exist leaves the identity ahead of them", async () => {
  await withDb(async (db) => {
    await db.query(`INSERT INTO groups (slug, name) VALUES ('berlin-bears', 'Berlin Bears')`);
    await migrate(db);
    const r = await db.query<{ id: number }>(`INSERT INTO groups (slug, name) VALUES ('third-team', 'Third') RETURNING id`);
    assert.equal(r.rows[0].id, 3);
  });
});

test("slugs must be unique, well-formed and not reserved", async () => {
  await withDb(async (db) => {
    const insert = (slug: string) => db.query(`INSERT INTO groups (slug, name) VALUES ($1, 'X')`, [slug]);
    for (const bad of ["krakow-pyramids", "ab", "-bears", "bears-", "Berlin", "berlin bears", "a".repeat(41), "admin", "g", "api"]) {
      await assert.rejects(insert(bad), /violates (unique|check) constraint/, bad);
    }
    await insert("abc");
    await insert("a".repeat(40));
  });
});

test("currency, status and name are validated", async () => {
  await withDb(async (db) => {
    await assert.rejects(db.query(`INSERT INTO groups (slug, name, currency) VALUES ('berlin-bears', 'B', 'eur')`));
    await assert.rejects(db.query(`INSERT INTO groups (slug, name, status) VALUES ('berlin-bears', 'B', 'deleted')`));
    await assert.rejects(db.query(`INSERT INTO groups (slug, name) VALUES ('berlin-bears', '  ')`));
  });
});
