import "server-only";
import { sqlClient } from "./db";

/**
 * Chemistry & head-to-head: fun social stats derived from team compositions and
 * results. Results are inferred from approved goals (more goals = win; equal =
 * draw). Small samples mislead and can be socially awkward, so a minimum number
 * of shared matches is required before a pairing is shown, and framing is
 * playful, never a verdict.
 */

export type PartnerStat = {
  playerId: number;
  name: string;
  shared: number;
  wins: number;
  winRate: number; // 0..1 over decisive matches together
};

export type OpponentStat = {
  playerId: number;
  name: string;
  faced: number;
  wins: number;
  losses: number;
};

export type ChemistryReport = {
  minShared: number;
  bestPartner: PartnerStat | null;
  worstPartner: PartnerStat | null;
  partners: PartnerStat[];
  rivals: OpponentStat[];
};

type RosterRow = {
  match_id: number;
  player_id: number;
  team_no: number;
  name: string;
  goals: number;
};

export async function getChemistry(
  playerId: number,
  opts: { minShared?: number } = {},
): Promise<ChemistryReport> {
  const minShared = opts.minShared ?? 3;

  const myMatches = (await sqlClient.query(
    `SELECT match_id, team_no FROM match_players WHERE player_id = $1`,
    [playerId],
  )) as Array<{ match_id: number; team_no: number }>;

  const empty: ChemistryReport = { minShared, bestPartner: null, worstPartner: null, partners: [], rivals: [] };
  if (myMatches.length === 0) return empty;

  const myTeamByMatch = new Map<number, number>();
  for (const r of myMatches) myTeamByMatch.set(Number(r.match_id), Number(r.team_no));
  const matchIds = [...myTeamByMatch.keys()];

  const roster = (await sqlClient.query(
    `SELECT mp.match_id, mp.player_id, mp.team_no, p.name,
            COALESCE(s.goals, 0) AS goals
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
      WHERE mp.match_id = ANY($1)`,
    [matchIds],
  )) as RosterRow[];

  // Team goal totals + winner per match.
  const teamGoals = new Map<string, number>();
  for (const r of roster) {
    const key = `${r.match_id}:${r.team_no}`;
    teamGoals.set(key, (teamGoals.get(key) ?? 0) + Number(r.goals));
  }
  const matchTeams = new Map<number, Map<number, number>>();
  for (const [key, goals] of teamGoals) {
    const [midStr, tnoStr] = key.split(":");
    const mid = Number(midStr);
    if (!matchTeams.has(mid)) matchTeams.set(mid, new Map());
    matchTeams.get(mid)!.set(Number(tnoStr), goals);
  }
  const winnerByMatch = new Map<number, number | null>();
  for (const [mid, teams] of matchTeams) {
    let best = -1;
    let winner: number | null = null;
    let tie = false;
    for (const [tno, goals] of teams) {
      if (goals > best) { best = goals; winner = tno; tie = false; }
      else if (goals === best) tie = true;
    }
    winnerByMatch.set(mid, tie || best <= 0 ? null : winner);
  }

  const partnerAgg = new Map<number, PartnerStat>();
  const rivalAgg = new Map<number, OpponentStat>();

  for (const r of roster) {
    const otherId = Number(r.player_id);
    if (otherId === playerId) continue;
    const mid = Number(r.match_id);
    const myTeam = myTeamByMatch.get(mid);
    if (myTeam == null) continue;
    const winner = winnerByMatch.get(mid); // null when draw / no result
    const iWon = winner != null && winner === myTeam;
    const iLost = winner != null && winner !== myTeam;
    const decisive = winner != null;

    if (Number(r.team_no) === myTeam) {
      let p = partnerAgg.get(otherId);
      if (!p) { p = { playerId: otherId, name: String(r.name), shared: 0, wins: 0, winRate: 0 }; partnerAgg.set(otherId, p); }
      p.shared += 1;
      if (iWon) p.wins += 1;
      // decisive count tracked implicitly via winRate calc below
      (p as PartnerStat & { _decisive?: number })._decisive =
        ((p as PartnerStat & { _decisive?: number })._decisive ?? 0) + (decisive ? 1 : 0);
    } else {
      let o = rivalAgg.get(otherId);
      if (!o) { o = { playerId: otherId, name: String(r.name), faced: 0, wins: 0, losses: 0 }; rivalAgg.set(otherId, o); }
      o.faced += 1;
      if (iWon) o.wins += 1;
      if (iLost) o.losses += 1;
    }
  }

  const partners = [...partnerAgg.values()]
    .filter((p) => p.shared >= minShared)
    .map((p) => {
      const decisive = (p as PartnerStat & { _decisive?: number })._decisive ?? 0;
      p.winRate = decisive > 0 ? p.wins / decisive : 0;
      return p;
    })
    .sort((a, b) => b.winRate - a.winRate || b.shared - a.shared);

  const rivals = [...rivalAgg.values()]
    .filter((o) => o.faced >= minShared)
    .sort((a, b) => b.faced - a.faced || b.wins - a.wins);

  return {
    minShared,
    bestPartner: partners.length ? partners[0] : null,
    worstPartner: partners.length ? partners[partners.length - 1] : null,
    partners,
    rivals,
  };
}
