/**
 * Golden-master + unit parity test for the scoring engine.
 *
 * Run with the same env the app uses (loads DATABASE_URL before imports):
 *
 *   node --env-file=.env.local --import tsx tests/scoring.golden.test.ts
 *
 * It does two things:
 *   1. Unit-checks the pure primitives against hand-computed values that mirror
 *      the Python engine (protects the math even when live data is neutral).
 *   2. Runs getPlayerScores() against the live DB and diffs every field against
 *      tests/golden_scores.json (a dump of the Python get_player_scores()).
 *
 * Fields must match within TOLERANCE (absorbs round-half-to-even vs float diffs).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import {
  getPlayerScores,
  statMetric,
  weightedAvg,
  statNorm,
  filterOutlierVotes,
  percentile,
  median,
  round2,
  STAT_MULTIPLIERS,
  type ScorePayload,
} from "../src/lib/scoring";

const TOLERANCE = 0.01;
const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`      ${(err as Error).message}`);
  }
}

function approx(actual: number, expected: number, msg: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${msg}: expected ${expected}, got ${actual}`,
  );
}

// ---------------------------------------------------------------------------
// 1. Pure primitive unit checks (mirror Python reference behaviour).
// ---------------------------------------------------------------------------
console.log("Primitive checks:");

check("round2 rounds half to even", () => {
  approx(round2(0.125), 0.12, "0.125");
  approx(round2(0.135), 0.14, "0.135");
  approx(round2(50), 50, "50");
});

check("median matches statistics.median", () => {
  approx(median([1, 2, 3]), 2, "odd");
  approx(median([1, 2, 3, 4]), 2.5, "even");
});

check("percentile linear interpolation", () => {
  approx(percentile([], 0.5), 0, "empty");
  approx(percentile([5], 0.25), 5, "single");
  approx(percentile([1, 2, 3, 4], 0.25), 1.75, "q1");
  approx(percentile([1, 2, 3, 4], 0.75), 3.25, "q3");
});

check("statMetric applies position multipliers", () => {
  // FWD: goals*1.0 + assists*1.2
  approx(statMetric("FWD", 2, 1, 0, 0, STAT_MULTIPLIERS), 2 * 1.0 + 1 * 1.2, "FWD");
  // GK: goals*2.0 + assists*1.0
  approx(statMetric("GK", 1, 1, 0, 0, STAT_MULTIPLIERS), 2.0 + 1.0, "GK");
  // Unknown position falls back to MID.
  approx(
    statMetric("XXX", 4, 0, 0, 0, STAT_MULTIPLIERS),
    4 * STAT_MULTIPLIERS.MID.goals,
    "fallback MID",
  );
});

check("weightedAvg weights first three by 2.0", () => {
  assert.equal(weightedAvg([]), null, "empty -> null");
  approx(weightedAvg([10])!, 10, "single");
  // Four values: (2*10 + 2*10 + 2*10 + 1*2) / (2+2+2+1) = 62/7
  approx(weightedAvg([10, 10, 10, 2])!, 62 / 7, "four values");
});

check("statNorm min-max and absolute anchor", () => {
  approx(statNorm([], null), 50, "raw null");
  approx(statNorm([], 5), 50, "empty vals");
  approx(statNorm([1, 1, 1], 1), 50 + 1 * 5, "all equal -> absolute");
  approx(statNorm([0, 10], 5), 50, "min-max midpoint");
  approx(statNorm([0, 10], 10), 100, "min-max max");
});

check("filterOutlierVotes IQR filtering", () => {
  assert.deepEqual(filterOutlierVotes([]), [], "empty");
  assert.deepEqual(filterOutlierVotes([5, 6, 7]), [5, 6, 7], "fewer than 4 untouched");
  // Extreme outlier removed.
  const filtered = filterOutlierVotes([5, 5, 5, 5, 100]);
  assert.ok(!filtered.includes(100), "outlier 100 removed");
});

// ---------------------------------------------------------------------------
// 2. Golden-master parity against the live DB.
// ---------------------------------------------------------------------------
console.log("\nGolden-master parity:");

const goldenPath = join(here, "golden_scores.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf-8")) as Record<
  string,
  ScorePayload
>;

async function main() {
  const scores = await getPlayerScores();

  check("player set matches golden", () => {
    const goldenIds = Object.keys(golden).map(Number).sort((a, b) => a - b);
    const actualIds = Object.keys(scores).map(Number).sort((a, b) => a - b);
    assert.deepEqual(actualIds, goldenIds, "player id sets differ");
  });

  let mismatches = 0;
  for (const [pidStr, expected] of Object.entries(golden)) {
    const pid = Number(pidStr);
    const actual = scores[pid];
    if (!actual) {
      mismatches++;
      console.error(`  ✗ player ${pid}: missing from TS output`);
      continue;
    }

    const problems: string[] = [];
    if (Math.abs(actual.final - expected.final) > TOLERANCE) {
      problems.push(`final ${actual.final} vs ${expected.final}`);
    }
    if (Math.abs(actual.peer - expected.peer) > TOLERANCE) {
      problems.push(`peer ${actual.peer} vs ${expected.peer}`);
    }
    const aStat = actual.stat;
    const eStat = expected.stat;
    if (aStat === null || eStat === null) {
      if (aStat !== eStat) problems.push(`stat ${aStat} vs ${eStat}`);
    } else if (Math.abs(aStat - eStat) > TOLERANCE) {
      problems.push(`stat ${aStat} vs ${eStat}`);
    }
    if (actual.has_stats !== expected.has_stats) {
      problems.push(`has_stats ${actual.has_stats} vs ${expected.has_stats}`);
    }

    if (problems.length > 0) {
      mismatches++;
      console.error(`  ✗ player ${pid}: ${problems.join(", ")}`);
    }
  }

  check(`all ${Object.keys(golden).length} players match golden`, () => {
    assert.equal(mismatches, 0, `${mismatches} player(s) differ from golden master`);
  });

  // -------------------------------------------------------------------------
  console.log("");
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("PASSED: scoring engine matches the golden master.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
