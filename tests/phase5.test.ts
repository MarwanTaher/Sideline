import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeCsvCell, toCsv } from "../src/lib/export-csv";
import { sanitizeErrorMessage } from "../src/lib/error-sanitization";
import {
  isSnapshotComplete,
  isSnapshotRevisionCurrent,
  SCORING_REVISION_TRIGGER_TABLES,
} from "../src/lib/score-cache-policy";

let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("phase-5 CSV and error sanitization");

test("CSV cells quote commas, quotes, and newlines", () => {
  assert.equal(escapeCsvCell('A, "B"\nC'), '"A, ""B""\nC"');
});

test("CSV cells neutralize spreadsheet formulas", () => {
  assert.equal(escapeCsvCell("=1+1"), "\"'=1+1\"");
  assert.equal(escapeCsvCell("  @SUM(A1:A2)"), "\"'  @SUM(A1:A2)\"");
});

test("CSV preserves numeric zero and emits headers", () => {
  assert.equal(toCsv(["value"], [[0]]), '"value"\r\n"0"\r\n');
  assert.equal(escapeCsvCell(-10), '"-10"');
});

test("error messages redact credentials and normalize line breaks", () => {
  assert.equal(
    sanitizeErrorMessage("bad\npassword=hunter2 Bearer abc123"),
    "bad password=[REDACTED] Bearer [REDACTED]",
  );
});

console.log("\nphase-5 score snapshot invalidation");

test("a changed scoring revision invalidates every persisted snapshot", () => {
  assert.equal(isSnapshotRevisionCurrent("41", "41"), true);
  assert.equal(isSnapshotRevisionCurrent("42", "41"), false);
});

test("revision triggers cover every scoring input table", () => {
  const migration = readFileSync("drizzle/0031_phase5_score_cache.sql", "utf8");
  for (const table of SCORING_REVISION_TRIGGER_TABLES) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER score_cache_revision_${table}\\s+AFTER INSERT OR UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION bump_score_cache_revision`,
        "i",
      ),
      `${table} mutations must bump the score revision`,
    );
  }
  assert.match(
    migration,
    /revision\s*=\s*score_cache_state\.revision\s*\+\s*1/i,
    "each scoring-input mutation must advance the monotonic revision",
  );
});

test("snapshots with missing or extra score entries are rejected", () => {
  assert.equal(isSnapshotComplete(3, 3), true);
  assert.equal(isSnapshotComplete(3, 2), false);
  assert.equal(isSnapshotComplete(3, 4), false);
  assert.equal(isSnapshotComplete(0, 0), true);
});

console.log(`\n${passed} phase-5 tests passed.`);
