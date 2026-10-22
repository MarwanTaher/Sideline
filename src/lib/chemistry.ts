import "server-only";
import { sqlClient } from "./db";
import {
  addResult,
  emptyRecord,
  getRoundOutcomes,
  groupRoundsByMatch,
  opponentTeamIn,
  recordPlayed,
  roundResultFor,
  winRate,
  type WinRecord,
} from "./results";
import {
  computeHeadToHead,
  emptyHeadToHead,
  type HeadToHead,
  type SharedMatch,
} from "./head-to-head";

export type { HeadToHead } from "./head-to-head";

/**
 * Chemistry & head-to-head: fun social stats derived from who played with whom
 * and how the mini-matches actually went. Small samples mislead and can be
 * socially awkward, so a minimum number of shared matches is required before a
 * pairing is shown, and framing is playful, never a verdict.
 *
 * Teams are fixed for a matchday, so teammates are per match — but opponents
 * change every round, so rivals are counted per round.
 */

export type PartnerStat = {
  playerId: number;
  name: string;
  /** Matchdays on the same team. */
  shared: number;
  record: WinRecord;
  /** Rounds played together; 0 means those matchdays have no recorded results. */
  rounds: number;
  /** Null when no rounds were recorded — which is not the same as never winning. */
  winRate: number | null;
};

export type OpponentStat = {
  playerId: number;
  name: string;
  /** Matchdays on opposing teams. */
  shared: number;
  /** Rounds actually played against each other. */
  faced: number;
  wins: number;
  draws: number;
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
};

export async function getChemistry(
  playerId: number,
  opts: { minShared?: number } = {},
): Promise<ChemistryReport> {
  const minShared = opts.minShared ?? 3;
  const empty: ChemistryReport = {
    minShared,
    bestPartner: null,
    worstPartner: null,
    partners: [],
    rivals: [],
  };

  const myMatches = (await sqlClient.query(
    `SELECT match_id, team_no FROM match_players WHERE player_id = $1`,
    [playerId],
  )) as Array<{ match_id: number; team_no: number }>;
  if (myMatches.length === 0) return empty;

  const myTeamByMatch = new Map<number, number>();
  for (const r of myMatches) myTeamByMatch.set(Number(r.match_id), Number(r.team_no));
  const matchIds = [...myTeamByMatch.keys()];

  const roster = (await sqlClient.query(
    `SELECT mp.match_id, mp.player_id, mp.team_no, p.name
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ANY($1)`,
    [matchIds],
  )) as RosterRow[];

  const roundsByMatch = groupRoundsByMatch(await getRoundOutcomes(matchIds));

  // Squad lists per match and team, so a round's opponents can be resolved.
  const squads = new Map<number, Map<number, RosterRow[]>>();
  for (const r of roster) {
    const mid = Number(r.match_id);
    let byTeam = squads.get(mid);
    if (!byTeam) {
      byTeam = new Map();
      squads.set(mid, byTeam);
    }
    const team = Number(r.team_no);
    const list = byTeam.get(team);
    if (list) list.push(r);
    else byTeam.set(team, [r]);
  }

  const partnerAgg = new Map<number, PartnerStat>();
  const rivalAgg = new Map<number, OpponentStat>();

  const partnerFor = (row: RosterRow): PartnerStat => {
    const id = Number(row.player_id);
    let p = partnerAgg.get(id);
    if (!p) {
      p = {
        playerId: id,
        name: String(row.name),
        shared: 0,
        record: emptyRecord(),
        rounds: 0,
        winRate: null,
      };
      partnerAgg.set(id, p);
    }
    return p;
  };
  const rivalFor = (row: RosterRow): OpponentStat => {
    const id = Number(row.player_id);
    let o = rivalAgg.get(id);
    if (!o) {
      o = { playerId: id, name: String(row.name), shared: 0, faced: 0, wins: 0, draws: 0, losses: 0 };
      rivalAgg.set(id, o);
    }
    return o;
  };

  for (const [matchId, myTeam] of myTeamByMatch) {
    const byTeam = squads.get(matchId);
    if (!byTeam) continue;

    const teammates = (byTeam.get(myTeam) ?? []).filter(
      (r) => Number(r.player_id) !== playerId,
    );
    for (const mate of teammates) partnerFor(mate).shared += 1;

    for (const otherTeam of byTeam.keys()) {
      if (otherTeam === myTeam) continue;
      for (const foe of byTeam.get(otherTeam) ?? []) rivalFor(foe).shared += 1;
    }

    for (const round of roundsByMatch.get(matchId) ?? []) {
      const result = roundResultFor(round, myTeam);
      if (!result) continue;

      for (const mate of teammates) {
        const p = partnerFor(mate);
        p.rounds += 1;
        addResult(p.record, result);
      }

      const foeTeam = opponentTeamIn(round, myTeam);
      if (foeTeam == null) continue;
      for (const foe of byTeam.get(foeTeam) ?? []) {
        const o = rivalFor(foe);
        o.faced += 1;
        if (result === "W") o.wins += 1;
        else if (result === "L") o.losses += 1;
        else o.draws += 1;
      }
    }
  }

  const partners = [...partnerAgg.values()]
    .filter((p) => p.shared >= minShared)
    .map((p) => ({ ...p, winRate: winRate(p.record) }))
    .sort((a, b) => {
      if (a.winRate == null && b.winRate == null) return b.shared - a.shared;
      if (a.winRate == null) return 1;
      if (b.winRate == null) return -1;
      return b.winRate - a.winRate || b.rounds - a.rounds;
    });

  const rivals = [...rivalAgg.values()]
    .filter((o) => o.shared >= minShared && o.faced > 0)
    .sort((a, b) => b.faced - a.faced || b.wins - a.wins);

  // Only crown a best/worst partner where there are enough real results.
  const ranked = partners.filter(
    (p) => p.winRate != null && recordPlayed(p.record) >= 3,
  );

  return {
    minShared,
    bestPartner: ranked.length > 0 ? ranked[0] : null,
    worstPartner: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    partners,
    rivals,
  };
}

/**
 * One pair, from the viewer's perspective: rounds faced against each other and
 * matchdays on the same team. Two queries (shared matchdays, then their round
 * results) instead of two full chemistry reports. Viewer-specific — never put
 * the result in a cache shared across viewers.
 */
export async function getHeadToHead(
  viewerId: number,
  otherId: number,
): Promise<HeadToHead> {
  if (viewerId === otherId) return emptyHeadToHead();

  const rows = (await sqlClient.query(
    `SELECT me.match_id, me.team_no AS viewer_team, them.team_no AS other_team
       FROM match_players me
       JOIN match_players them
         ON them.match_id = me.match_id AND them.player_id = $2
      WHERE me.player_id = $1`,
    [viewerId, otherId],
  )) as Array<{ match_id: number; viewer_team: number; other_team: number }>;
  if (rows.length === 0) return emptyHeadToHead();

  const shared: SharedMatch[] = rows.map((r) => ({
    matchId: Number(r.match_id),
    viewerTeam: Number(r.viewer_team),
    otherTeam: Number(r.other_team),
  }));
  const rounds = await getRoundOutcomes(shared.map((s) => s.matchId));
  return computeHeadToHead(shared, rounds);
}
