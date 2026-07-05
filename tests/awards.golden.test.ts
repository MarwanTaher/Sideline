/**
 * Golden-master + unit parity test for the awards engine.
 *
 * Run with the same env the app uses (loads DATABASE_URL before imports):
 *
 *   node --env-file=.env.local --import tsx tests/awards.golden.test.ts
 *
 * It does two things:
 *   1. Unit-checks the pure helpers (tie handling, scope keys) against
 *      hand-computed values — protects the logic even when live data is empty.
 *   2. Runs getAwards() for the overall scope and every match, diffing the
 *      winners / metric_label / source against tests/golden_awards.json (a dump
 *      of the Python get_awards()).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import {
  getAwards,
  winnersFromRows,
  scopeKey,
  AWARD_TYPES,
  type AwardWinner,
} from "../src/lib/awards";

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

function winner(player_id: number, metric_value: number | null, position = "MID"): AwardWinner {
  return { player_id, name: `P${player_id}`, preferred_position: position, metric_value, valid_votes: null };
}

// ---------------------------------------------------------------------------
// 1. Pure helper unit checks.
// ---------------------------------------------------------------------------
console.log("Helper checks:");

check("winnersFromRows returns empty for no rows", () => {
  assert.deepEqual(winnersFromRows([]), []);
});

check("winnersFromRows picks single max", () => {
  const w = winnersFromRows([winner(1, 3), winner(2, 5), winner(3, 4)]);
  assert.deepEqual(w.map((r) => r.player_id), [2]);
});

check("winnersFromRows returns all ties at the max", () => {
  const w = winnersFromRows([winner(1, 5), winner(2, 5), winner(3, 4)]);
  assert.deepEqual(w.map((r) => r.player_id).sort((a, b) => a - b), [1, 2]);
});

check("winnersFromRows handles float peer averages", () => {
  const w = winnersFromRows([winner(1, 7.5), winner(2, 7.5), winner(3, 7.25)]);
  assert.deepEqual(w.map((r) => r.player_id).sort((a, b) => a - b), [1, 2]);
});

check("scopeKey overall + match", () => {
  assert.equal(scopeKey("overall", null), "overall");
  assert.equal(scopeKey("match", 42), "match:42");
  assert.throws(() => scopeKey("match", null), /match_id is required/);
});

// ---------------------------------------------------------------------------
// 2. Golden-master parity against the live DB.
// ---------------------------------------------------------------------------
console.log("\nGolden-master parity:");

interface GoldenWinner {
  player_id: number;
  metric_value: number | null;
}
interface GoldenBlock {
  winners: GoldenWinner[];
  metric_label: string;
  source: string;
}
type GoldenScope = Record<string, GoldenBlock>;

const goldenPath = join(here, "golden_awards.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf-8")) as Record<string, GoldenScope>;

function projectWinners(winners: AwardWinner[]): GoldenWinner[] {
  return winners
    .map((w) => ({
      player_id: Number(w.player_id),
      metric_value: w.metric_value === null ? null : Math.round(Number(w.metric_value) * 1e4) / 1e4,
    }))
    .sort((a, b) => a.player_id - b.player_id);
}

function diffScope(scopeName: string, expected: GoldenScope, actual: GoldenScope): string[] {
  const problems: string[] = [];
  for (const awardType of AWARD_TYPES) {
    const e = expected[awardType];
    const a = actual[awardType];
    if (!e || !a) {
      problems.push(`${awardType}: missing block (golden=${!!e}, ts=${!!a})`);
      continue;
    }
    if (e.metric_label !== a.metric_label) {
      problems.push(`${awardType}.metric_label ${a.metric_label} vs ${e.metric_label}`);
    }
    if (e.source !== a.source) {
      problems.push(`${awardType}.source ${a.source} vs ${e.source}`);
    }
    const eIds = e.winners.map((w) => w.player_id).sort((x, y) => x - y);
    const aIds = a.winners.map((w) => w.player_id).sort((x, y) => x - y);
    if (JSON.stringify(eIds) !== JSON.stringify(aIds)) {
      problems.push(`${awardType}.winners [${aIds}] vs [${eIds}]`);
      continue;
    }
    for (let i = 0; i < e.winners.length; i++) {
      const ew = e.winners[i];
      const aw = a.winners[i];
      if (ew.metric_value === null || aw.metric_value === null) {
        if (ew.metric_value !== aw.metric_value) {
          problems.push(`${awardType}.winner ${ew.player_id} metric ${aw.metric_value} vs ${ew.metric_value}`);
        }
      } else if (Math.abs(ew.metric_value - aw.metric_value) > TOLERANCE) {
        problems.push(`${awardType}.winner ${ew.player_id} metric ${aw.metric_value} vs ${ew.metric_value}`);
      }
    }
  }
  return problems.map((p) => `${scopeName}: ${p}`);
}

async function computeScope(scopeName: string): Promise<GoldenScope> {
  const result =
    scopeName === "overall"
      ? await getAwards("overall")
      : await getAwards("match", Number(scopeName.split(":")[1]));
  const out: GoldenScope = {};
  for (const awardType of AWARD_TYPES) {
    const block = result.awards[awardType];
    out[awardType] = {
      winners: projectWinners(block.winners),
      metric_label: block.metric_label,
      source: block.source,
    };
  }
  return out;
}

async function main() {
  const scopeNames = Object.keys(golden).sort();

  check("scope set is non-empty", () => {
    assert.ok(scopeNames.length > 0, "golden_awards.json has no scopes");
  });

  let mismatches = 0;
  for (const scopeName of scopeNames) {
    const actual = await computeScope(scopeName);
    const problems = diffScope(scopeName, golden[scopeName], actual);
    if (problems.length > 0) {
      mismatches += problems.length;
      for (const p of problems) console.error(`  ✗ ${p}`);
    }
  }

  check(`all ${scopeNames.length} scopes match golden`, () => {
    assert.equal(mismatches, 0, `${mismatches} difference(s) from golden master`);
  });

  console.log("");
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("PASSED: awards engine matches the golden master.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
