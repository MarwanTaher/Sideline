import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { GROUP_ID_TABLES, TENANCY_TABLES } from "./helpers/tenancy-tables";

// Static inventory only: reads migration and source files, never a database.

const ROOT = new URL("..", import.meta.url).pathname;
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?:public"?\."?)?(?!IF\b)(\w+)"?/gi;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

function createdTables(paths: string[]): Set<string> {
  const names = new Set<string>();
  for (const path of paths) {
    for (const m of readFileSync(path, "utf8").matchAll(CREATE_TABLE)) names.add(m[1]);
  }
  return names;
}

const migrationTables = createdTables(files(join(ROOT, "drizzle"), /^\d{4}_.*\.sql$/));
const lazyTables = createdTables(files(join(ROOT, "src"), /\.tsx?$/));
const allTables = new Set([...migrationTables, ...lazyTables]);

test("every table created by a migration or lazily in src is classified", () => {
  const unclassified = [...allTables].filter((t) => !(t in TENANCY_TABLES)).sort();
  assert.deepEqual(unclassified, [], `classify these in tests/helpers/tenancy-tables.ts`);
});

test("the classification lists no table that does not exist", () => {
  const stale = Object.keys(TENANCY_TABLES).filter((t) => !allTables.has(t)).sort();
  assert.deepEqual(stale, []);
});

test("group and identity tables have a migration area; others do not", () => {
  for (const [name, t] of Object.entries(TENANCY_TABLES)) {
    const owned = t.scope === "group" || t.scope === "identity";
    assert.equal(t.area !== null, owned, name);
  }
});

test("no group-owned table is created lazily outside a migration", () => {
  const lazyOwned = GROUP_ID_TABLES.filter((t) => lazyTables.has(t) && !migrationTables.has(t));
  assert.deepEqual(lazyOwned, []);
});
