/**
 * Regenerate tests/golden_scores.json from the current scoring engine + live
 * DB. Run when the golden master has drifted because the database gained new
 * matches, votes or stats (the golden is a static snapshot; the engine reads
 * live data).
 *
 *   node --env-file=.env.local --import tsx tests/dump_golden.ts
 *
 * Keys are sorted (player ids numerically, fields alphabetically) so the diff
 * against the previous snapshot stays minimal and reviewable.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPlayerScores } from "../src/lib/scoring";

const here = dirname(fileURLToPath(import.meta.url));

/** Stable stringify: numeric-sorted top-level ids, alpha-sorted inner keys. */
function stableStringify(scores: Record<number, unknown>): string {
  const ids = Object.keys(scores)
    .map(Number)
    .sort((a, b) => a - b);
  const ordered: Record<string, unknown> = {};
  for (const id of ids) {
    const payload = scores[id] as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
    ordered[String(id)] = sorted;
  }
  return JSON.stringify(ordered, null, 2) + "\n";
}

async function main() {
  const scores = await getPlayerScores();
  const out = join(here, "golden_scores.json");
  writeFileSync(out, stableStringify(scores), "utf-8");
  console.log(`Wrote ${Object.keys(scores).length} players to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
