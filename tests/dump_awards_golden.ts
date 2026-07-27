/**
 * Regenerate tests/golden_awards.json from the current awards engine + live DB.
 * Run when the awards baseline legitimately changes (engine change or new match
 * data):
 *
 *   node --env-file=.env.local --import tsx tests/dump_awards_golden.ts
 *
 * Mirrors the projection used by awards.golden.test.ts (winner player_id +
 * metric_value rounded to 4dp, plus metric_label and source), keyed by scope
 * ("overall" and "match:<id>") with sorted keys for a minimal diff.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getAwards,
  getAwardMatches,
  AWARD_TYPES,
  type AwardWinner,
} from "../src/lib/awards";

const here = dirname(fileURLToPath(import.meta.url));

function projectWinners(winners: AwardWinner[]) {
  return winners
    .map((w) => ({
      metric_value: w.metric_value === null ? null : Math.round(Number(w.metric_value) * 1e4) / 1e4,
      player_id: Number(w.player_id),
    }))
    .sort((a, b) => a.player_id - b.player_id);
}

async function computeScope(scopeName: string) {
  const result =
    scopeName === "overall"
      ? await getAwards("overall")
      : await getAwards("match", Number(scopeName.split(":")[1]));
  const out: Record<string, unknown> = {};
  for (const awardType of AWARD_TYPES) {
    const block = result.awards[awardType];
    out[awardType] = {
      metric_label: block.metric_label,
      source: block.source,
      winners: projectWinners(block.winners),
    };
  }
  return out;
}

/** Deep key-sorted stringify so diffs stay minimal. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = sortKeys(obj[k]);
    return sorted;
  }
  return value;
}

async function main() {
  const matches = await getAwardMatches();
  const scopeNames = ["overall", ...matches.map((m) => `match:${m.id}`)];

  const golden: Record<string, unknown> = {};
  for (const scopeName of scopeNames) {
    golden[scopeName] = await computeScope(scopeName);
  }

  const out = join(here, "golden_awards.json");
  writeFileSync(out, JSON.stringify(sortKeys(golden), null, 2) + "\n", "utf-8");
  console.log(`Wrote ${scopeNames.length} scopes to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
