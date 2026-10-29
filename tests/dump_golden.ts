/**
 * Regenerate ignored tests/.local/golden_scores.json from an explicitly
 * approved non-production database. Set ALLOW_GOLDEN_DB_TESTS=1 and a matching
 * GOLDEN_DATABASE_HOST before running. Never commit database snapshots.
 *
 *   node --env-file=.env.local --import tsx tests/dump_golden.ts
 *
 * Keys are sorted (player ids numerically, fields alphabetically) so the diff
 * against the previous snapshot stays minimal and reviewable.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getPlayerScores } from "../src/lib/scoring";
import { localGoldenPath } from "./golden-db";

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
  const out = localGoldenPath("golden_scores.json");
  const scores = await getPlayerScores();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, stableStringify(scores), "utf-8");
  console.log(`Wrote ${Object.keys(scores).length} players to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
