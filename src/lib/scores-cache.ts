import "server-only";
import { revalidateTag } from "next/cache";
import { SCORES_CACHE_TAG } from "./leaderboard";

/**
 * Invalidate the cached leaderboard/score reads. Call this from any server
 * action that changes something the scoring engine depends on: votes, approved
 * stats, roster/team assignment, player active state, scoring config, and
 * matchday close.
 */
export function revalidateScores(): void {
  // Next.js 16 requires a cache-life profile as the second argument; "max"
  // fully purges the tagged entries so the next read recomputes.
  revalidateTag(SCORES_CACHE_TAG, "max");
}
