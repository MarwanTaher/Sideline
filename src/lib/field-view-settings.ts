import "server-only";
import { cache } from "react";
import { getSetting, setSetting } from "./feature-settings";
import { sqlClient } from "./db";
import { getMotmWinner } from "./motm";
import { parseFieldFeatures, type FieldFeature, type FieldFeatures } from "./field-view";

const KEY = "field_view_features";

export const getFieldFeatures = cache(async (): Promise<FieldFeatures> => parseFieldFeatures(await getSetting(KEY)));

export async function setFieldFeature(feature: FieldFeature, enabled: boolean): Promise<void> {
  const current = parseFieldFeatures(await getSetting(KEY));
  current[feature] = enabled;
  await setSetting(KEY, JSON.stringify(current));
}

export type MatchLive = {
  /** Keyed by player id; guests use the negative guest id like the roster. */
  stats: Record<number, { goals: number; assists: number }>;
  motmId: number | null;
};

/**
 * Goals/assists for the field overlay: the live matchday log when there is
 * one, otherwise approved stats. MOTM only once the matchday is closed.
 */
export async function getMatchLive(matchId: number, closed: boolean): Promise<MatchLive> {
  const [logRows, statRows, motm] = await Promise.all([
    sqlClient.query(
      `SELECT pid, SUM(g) AS goals, SUM(a) AS assists FROM (
         SELECT COALESCE(scorer_player_id, -scorer_guest_id) AS pid, 1 AS g, 0 AS a
           FROM round_goals WHERE match_id = $1::int AND (scorer_player_id IS NOT NULL OR scorer_guest_id IS NOT NULL)
         UNION ALL
         SELECT COALESCE(assist_player_id, -assist_guest_id), 0, 1
           FROM round_goals WHERE match_id = $1::int AND (assist_player_id IS NOT NULL OR assist_guest_id IS NOT NULL)
       ) x GROUP BY pid`,
      [matchId],
    ) as unknown as Promise<Array<{ pid: number; goals: number; assists: number }>>,
    sqlClient.query(
      `SELECT player_id AS pid, goals, assists FROM stats WHERE match_id = $1::int`,
      [matchId],
    ) as unknown as Promise<Array<{ pid: number; goals: number; assists: number }>>,
    closed ? getMotmWinner(matchId) : Promise.resolve(null),
  ]);
  const rows = logRows.length > 0 ? logRows : statRows;
  const stats: MatchLive["stats"] = {};
  for (const r of rows) {
    const g = Number(r.goals);
    const a = Number(r.assists);
    if (g > 0 || a > 0) stats[Number(r.pid)] = { goals: g, assists: a };
  }
  return { stats, motmId: motm?.playerId ?? null };
}
