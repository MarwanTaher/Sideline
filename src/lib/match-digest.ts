import "server-only";
import { sqlClient } from "./db";
import { fmtDate, fmtMatchTime } from "./format";
import { getMotmWinner } from "./motm";
import { getRatingChangesForMatch } from "./score-snapshots";

/**
 * Post-match digest: the punchy summary behind the shareable result card and
 * the "results are in" moment. Team scores are derived from approved goals
 * (there is no separate result column) — the side with more goals is ahead.
 */

export type DigestTeam = {
  teamNo: number;
  name: string;
  goals: number;
};

export type MatchDigest = {
  matchId: number;
  playedOn: string;
  playedOnLabel: string;
  matchTimeLabel: string;
  teams: DigestTeam[];
  topScorer: { name: string; goals: number } | null;
  motm: { name: string; votes: number } | null;
  movers: { name: string; deltaFinal: number }[];
  hasResult: boolean;
};

function parseTeamNames(value: unknown): Record<number, string> {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const obj = JSON.parse(value) as Record<string, unknown>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(k);
      if (Number.isFinite(n) && typeof v === "string" && v.trim() !== "") {
        out[n] = v.trim().slice(0, 40);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function getMatchDigest(matchId: number): Promise<MatchDigest | null> {
  const metaRows = (await sqlClient.query(
    `SELECT id, played_on, COALESCE(match_time, '') AS match_time, team_names
       FROM matches WHERE id = $1`,
    [matchId],
  )) as Array<{ id: number; played_on: string; match_time: string; team_names: string | null }>;
  if (metaRows.length === 0) return null;
  const meta = metaRows[0];
  const teamNames = parseTeamNames(meta.team_names);

  const teamRows = (await sqlClient.query(
    `SELECT mp.team_no,
            COALESCE(SUM(s.goals), 0) AS goals
       FROM match_players mp
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
      WHERE mp.match_id = $1
      GROUP BY mp.team_no
      ORDER BY mp.team_no`,
    [matchId],
  )) as Array<{ team_no: number; goals: number }>;

  const teams: DigestTeam[] = teamRows.map((r) => ({
    teamNo: Number(r.team_no),
    name: teamNames[Number(r.team_no)] ?? `Team ${Number(r.team_no)}`,
    goals: Number(r.goals),
  }));

  const scorerRows = (await sqlClient.query(
    `SELECT p.name, s.goals
       FROM stats s JOIN players p ON p.id = s.player_id
      WHERE s.match_id = $1 AND s.goals > 0
      ORDER BY s.goals DESC, p.name ASC
      LIMIT 1`,
    [matchId],
  )) as Array<{ name: string; goals: number }>;
  const topScorer = scorerRows.length
    ? { name: String(scorerRows[0].name), goals: Number(scorerRows[0].goals) }
    : null;

  const winner = await getMotmWinner(matchId);
  const motm = winner ? { name: winner.name, votes: winner.votes } : null;

  const changes = await getRatingChangesForMatch(matchId, { minAbsDelta: 0.5 });
  const movers = changes
    .filter((c) => c.deltaFinal > 0)
    .sort((a, b) => b.deltaFinal - a.deltaFinal)
    .slice(0, 3)
    .map((c) => ({ name: c.name, deltaFinal: c.deltaFinal }));

  const hasResult = teams.some((t) => t.goals > 0);

  return {
    matchId: Number(meta.id),
    playedOn: String(meta.played_on),
    playedOnLabel: fmtDate(String(meta.played_on)),
    matchTimeLabel: fmtMatchTime(String(meta.match_time)),
    teams,
    topScorer,
    motm,
    movers,
    hasResult,
  };
}

/** A one-line scoreline like "Team Red 6–4 Team Blue" (or teams listed). */
export function scorelineText(digest: MatchDigest): string {
  if (digest.teams.length === 0) return "";
  if (digest.teams.length === 2) {
    const [a, b] = digest.teams;
    return `${a.name} ${a.goals}\u2013${b.goals} ${b.name}`;
  }
  return digest.teams.map((t) => `${t.name} ${t.goals}`).join(" · ");
}

/** WhatsApp-ready share message. Includes the public summary link. */
export function buildDigestShareText(digest: MatchDigest, url: string): string {
  const lines: string[] = [];
  lines.push(`\u26bd ${digest.playedOnLabel}${digest.matchTimeLabel ? ` ${digest.matchTimeLabel}` : ""}`);
  const scoreline = scorelineText(digest);
  if (scoreline) lines.push(scoreline);
  if (digest.motm) lines.push(`\ud83c\udfc6 MOTM: ${digest.motm.name}`);
  if (digest.topScorer) lines.push(`\u26bd Top scorer: ${digest.topScorer.name} (${digest.topScorer.goals})`);
  if (url) lines.push(url);
  return lines.join("\n");
}
