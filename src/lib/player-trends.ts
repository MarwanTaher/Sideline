import "server-only";
import { sqlClient } from "./db";

/**
 * "Your season" — personal form, trends and highlights. A number is a lookup; a
 * trend is a reason to come back. We lead with 2–3 human-readable highlights and
 * keep the charts as lightweight inline-SVG series (no chart library). Sparse
 * data is handled gracefully: a player with < 3 matches gets highlights only.
 */

export type SeriesPoint = { matchId: number; label: string; value: number };
export type MatchResult = "W" | "D" | "L";

export type PlayerSeason = {
  appearances: number;
  goals: number;
  assists: number;
  lastMatch: { goals: number; assists: number } | null;
  ratingSeries: SeriesPoint[];
  goalsSeries: SeriesPoint[];
  form: MatchResult[];
  highlights: string[];
  hasEnoughData: boolean;
};

function shortDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}` : d;
}

export async function getPlayerSeason(playerId: number): Promise<PlayerSeason> {
  // Chronological match participation with goals/assists.
  const matchRows = (await sqlClient.query(
    `SELECT mp.match_id, mp.team_no, m.played_on,
            COALESCE(s.goals, 0) AS goals,
            COALESCE(s.assists, 0) AS assists
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
      WHERE mp.player_id = $1
      ORDER BY m.played_on ASC, mp.match_id ASC`,
    [playerId],
  )) as Array<{ match_id: number; team_no: number; played_on: string; goals: number; assists: number }>;

  const matchIds = matchRows.map((r) => Number(r.match_id));

  // Team goal totals for the player's matches to infer results.
  const winnerByMatch = new Map<number, number | null>();
  if (matchIds.length > 0) {
    const teamRows = (await sqlClient.query(
      `SELECT mp.match_id, mp.team_no, COALESCE(SUM(s.goals), 0) AS goals
         FROM match_players mp
         LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
        WHERE mp.match_id = ANY($1)
        GROUP BY mp.match_id, mp.team_no`,
      [matchIds],
    )) as Array<{ match_id: number; team_no: number; goals: number }>;
    const perMatch = new Map<number, Array<{ team: number; goals: number }>>();
    for (const r of teamRows) {
      const mid = Number(r.match_id);
      if (!perMatch.has(mid)) perMatch.set(mid, []);
      perMatch.get(mid)!.push({ team: Number(r.team_no), goals: Number(r.goals) });
    }
    for (const [mid, teams] of perMatch) {
      let best = -1;
      let winner: number | null = null;
      let tie = false;
      for (const t of teams) {
        if (t.goals > best) { best = t.goals; winner = t.team; tie = false; }
        else if (t.goals === best) tie = true;
      }
      winnerByMatch.set(mid, tie || best <= 0 ? null : winner);
    }
  }

  let goals = 0;
  let assists = 0;
  const goalsSeries: SeriesPoint[] = [];
  const results: { matchId: number; result: MatchResult | null }[] = [];
  for (const r of matchRows) {
    goals += Number(r.goals);
    assists += Number(r.assists);
    goalsSeries.push({ matchId: Number(r.match_id), label: shortDate(String(r.played_on)), value: Number(r.goals) });
    const winner = winnerByMatch.get(Number(r.match_id));
    let result: MatchResult | null = null;
    if (winner != null) result = winner === Number(r.team_no) ? "W" : "L";
    else if (winnerByMatch.has(Number(r.match_id))) result = "D";
    results.push({ matchId: Number(r.match_id), result });
  }

  // Rating over time from leaderboard snapshots for this player.
  const snapRows = (await sqlClient.query(
    `SELECT snapshot_key, final, captured_at
       FROM legacy_score_snapshots
      WHERE player_id = $1 AND snapshot_key LIKE 'match_%'
      ORDER BY captured_at ASC`,
    [playerId],
  )) as Array<{ snapshot_key: string; final: number; captured_at: string }>;
  const ratingSeries: SeriesPoint[] = snapRows.map((r) => {
    const mid = Number(String(r.snapshot_key).replace("match_", "")) || 0;
    return { matchId: mid, label: `#${mid}`, value: Number(r.final) };
  });

  // Highlights.
  const highlights: string[] = [];
  const form: MatchResult[] = results
    .map((r) => r.result)
    .filter((r): r is MatchResult => r != null)
    .slice(-5);

  // Current scoring streak (most recent consecutive matches with a goal).
  let streak = 0;
  for (let i = matchRows.length - 1; i >= 0; i--) {
    if (Number(matchRows[i].goals) > 0) streak += 1;
    else break;
  }
  if (streak >= 2) highlights.push(`You're on a ${streak}-match scoring streak \u26bd`);

  // Best rating movement across the last two snapshots.
  if (ratingSeries.length >= 2) {
    const last = ratingSeries[ratingSeries.length - 1].value;
    const prev = ratingSeries[ratingSeries.length - 2].value;
    const delta = last - prev;
    if (Math.abs(delta) >= 0.5) {
      highlights.push(
        delta > 0
          ? `Your rating climbed ${delta.toFixed(1)} to ${last.toFixed(1)} after the last match \ud83d\udcc8`
          : `Your rating is ${last.toFixed(1)} \u2014 a great match away from bouncing back`,
      );
    }
  }

  // Best single match by goals.
  const bestGoals = matchRows.reduce((mx, r) => Math.max(mx, Number(r.goals)), 0);
  if (bestGoals >= 2) highlights.push(`Your best haul: ${bestGoals} goals in a match \ud83c\udfaf`);

  // Win-heavy recent form.
  const recentWins = form.filter((r) => r === "W").length;
  if (form.length >= 3 && recentWins >= Math.ceil(form.length * 0.6)) {
    highlights.push(`Winning ${recentWins} of your last ${form.length} \ud83d\udd25`);
  }

  if (highlights.length === 0 && matchRows.length > 0) {
    highlights.push(`${matchRows.length} matches, ${goals} goals, ${assists} assists so far`);
  }

  return {
    appearances: matchRows.length,
    goals,
    assists,
    lastMatch:
      matchRows.length > 0
        ? {
            goals: Number(matchRows[matchRows.length - 1].goals),
            assists: Number(matchRows[matchRows.length - 1].assists),
          }
        : null,
    ratingSeries,
    goalsSeries,
    form,
    highlights,
    hasEnoughData: matchRows.length >= 3,
  };
}
