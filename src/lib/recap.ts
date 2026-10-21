import "server-only";
import { sqlClient } from "./db";
import { getMatchDigest, type MatchDigest } from "./match-digest";
import { getMotmWinner } from "./motm";
import { getMatchRosterFacts, type RosterRow } from "./moments";
import { snapshotKeyForMatch } from "./score-snapshots";

export type RecapRating = {
  prevFinal: number;
  newFinal: number;
  prevRank: number | null;
  newRank: number | null;
};

export type RecapDuo = { a: string; b: string; count: number };

export type MatchRecap = {
  digest: MatchDigest;
  me: (RosterRow & { teamName: string }) | null;
  rating: RecapRating | null;
  motm: { playerId: number; name: string; votes: number } | null;
  /** The match's most productive assist → goal pair. */
  bestDuo: RecapDuo | null;
  /** The viewer's own most productive partner, if any. */
  myDuo: RecapDuo | null;
};

function rankOf(payload: string | null): number | null {
  if (!payload) return null;
  try {
    const r = (JSON.parse(payload) as { rank?: unknown }).rank;
    return typeof r === "number" ? r : null;
  } catch {
    return null;
  }
}

async function getRecapRating(matchId: number, playerId: number): Promise<RecapRating | null> {
  const rows = (await sqlClient.query(
    `WITH cur AS (
       SELECT final, payload_json, captured_at FROM legacy_score_snapshots
        WHERE snapshot_key = $1 AND player_id = $2::int
     ), prev AS (
       SELECT s.final, s.payload_json FROM legacy_score_snapshots s, cur
        WHERE s.player_id = $2::int AND s.captured_at < cur.captured_at
        ORDER BY s.captured_at DESC LIMIT 1
     )
     SELECT cur.final AS new_final, cur.payload_json AS new_payload,
            prev.final AS prev_final, prev.payload_json AS prev_payload
       FROM cur LEFT JOIN prev ON true`,
    [snapshotKeyForMatch(matchId), playerId],
  )) as Array<{ new_final: number; new_payload: string | null; prev_final: number | null; prev_payload: string | null }>;
  const r = rows[0];
  if (!r || r.prev_final == null) return null;
  return {
    prevFinal: Number(r.prev_final),
    newFinal: Number(r.new_final),
    prevRank: rankOf(r.prev_payload),
    newRank: rankOf(r.new_payload),
  };
}

async function getDuos(matchId: number): Promise<Array<{ s: number; a: number; sn: string; an: string; n: number }>> {
  const rows = (await sqlClient.query(
    `SELECT rg.scorer_player_id AS s, rg.assist_player_id AS a, ps.name AS sn, pa.name AS an, COUNT(*) AS n
       FROM round_goals rg
       JOIN players ps ON ps.id = rg.scorer_player_id
       JOIN players pa ON pa.id = rg.assist_player_id
      WHERE rg.match_id = $1 AND COALESCE(rg.is_own_goal, 0) = 0
      GROUP BY rg.scorer_player_id, rg.assist_player_id, ps.name, pa.name
      ORDER BY n DESC, s`,
    [matchId],
  )) as Array<{ s: number; a: number; sn: string; an: string; n: number }>;
  return rows.map((r) => ({ s: Number(r.s), a: Number(r.a), sn: String(r.sn), an: String(r.an), n: Number(r.n) }));
}

const first = (name: string) => name.split(" ")[0];

/** Everything the post-match story cards need, for one viewer. */
export async function getMatchRecap(matchId: number, playerId: number | null): Promise<MatchRecap | null> {
  const digest = await getMatchDigest(matchId);
  if (!digest) return null;
  const [facts, rating, winner, duos] = await Promise.all([
    playerId != null ? getMatchRosterFacts(matchId) : Promise.resolve([] as RosterRow[]),
    playerId != null ? getRecapRating(matchId, playerId) : Promise.resolve(null),
    getMotmWinner(matchId),
    getDuos(matchId),
  ]);
  const mine = playerId != null ? facts.find((f) => f.player_id === playerId) ?? null : null;
  const teamName = mine ? (digest.teams.find((t) => t.teamNo === mine.team_no)?.name ?? `Team ${mine.team_no}`) : "";
  const top = duos[0];
  const myTop = playerId != null ? duos.find((d) => d.s === playerId || d.a === playerId) : undefined;
  return {
    digest,
    me: mine ? { ...mine, teamName } : null,
    rating,
    motm: winner ? { playerId: winner.playerId, name: winner.name, votes: winner.votes } : null,
    bestDuo: top && top.n >= 2 ? { a: first(top.an), b: first(top.sn), count: top.n } : null,
    myDuo: myTop ? { a: first(myTop.an), b: first(myTop.sn), count: myTop.n } : null,
  };
}
