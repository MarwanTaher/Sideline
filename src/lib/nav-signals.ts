import "server-only";
import { sqlClient } from "./db";

/**
 * Cheap "is there something new" signals for the nav dots. Each value changes
 * when the relevant section gets new content; the client compares it against a
 * last-seen value in localStorage to decide whether to show a dot.
 */
export interface NavSignals {
  /** Latest match id + its matchday status (new match or status change). */
  matches: string;
  /** Most recent closed match id (leaderboard is "new" when results land). */
  leaderboard: string;
}

export async function getNavSignals(): Promise<NavSignals> {
  const latest = (await sqlClient.query(
    `SELECT id, COALESCE(matchday_status, 'draft') AS status
       FROM matches
      ORDER BY played_on DESC, id DESC
      LIMIT 1`,
  )) as Array<{ id: number; status: string }>;

  const closed = (await sqlClient.query(
    `SELECT id FROM matches
      WHERE matchday_status = 'closed'
      ORDER BY played_on DESC, id DESC
      LIMIT 1`,
  )) as Array<{ id: number }>;

  const m = latest[0];
  return {
    matches: m ? `${m.id}:${m.status}` : "none",
    leaderboard: closed[0] ? `c${closed[0].id}` : "none",
  };
}
