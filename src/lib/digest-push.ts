import type { MatchDigest } from "@/lib/match-digest";

export function digestPushBody(digest: MatchDigest | null): string {
  if (!digest) return "The matchday is complete. Open your recap and updated ratings.";
  const highlights: string[] = [];
  if (digest.motm) highlights.push(`MOTM: ${digest.motm.name}`);
  if (digest.topScorer) highlights.push(`Top scorer: ${digest.topScorer.name} (${digest.topScorer.goals})`);
  const mover = digest.movers[0];
  if (mover) highlights.push(`${mover.name} +${mover.deltaFinal.toFixed(1)}`);
  return highlights.length
    ? `${highlights.join(" · ")}. Full recap inside.`
    : "The matchday is complete. Open your recap and updated ratings.";
}
