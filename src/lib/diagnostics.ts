import { sqlClient } from "@/lib/db";

export interface PerMatchDiag {
  matchId: number;
  playedOn: string;
  statsOn: boolean;
  players: number;
  statsRows: number;
  approvedSubs: number;
  votes: number;
}

export interface Diagnostics {
  totalVotes: number;
  validVotes: number;
  matchPlayers: number;
  stats: number;
  submissionsTotal: number;
  submissionsApproved: number;
  matchesStatsOn: number;
  matchesTotal: number;
  goalsSum: number;
  assistsSum: number;
  perMatch: PerMatchDiag[];
  engineStatRows: number;
  engineGoalsTotal: number;
  engineAssistsTotal: number;
  warnings: string[];
}

async function scalar(sql: string): Promise<number> {
  const raw = (await sqlClient.query(sql)) as unknown as { n: number }[];
  return raw.length ? Number(raw[0].n) : 0;
}

export async function getDiagnostics(): Promise<Diagnostics> {
  const totalVotes = await scalar("SELECT COUNT(*) AS n FROM votes");
  const validVotes = await scalar(
    `SELECT COUNT(*) AS n FROM votes
     WHERE CASE
       WHEN COALESCE(scope_status, 'in_scope') = 'in_scope' THEN 1
       WHEN COALESCE(scope_status, 'in_scope') IN ('out_of_scope', 'removed_from_calculation') THEN 0
       ELSE COALESCE(include_in_calculation, 1)
     END = 1`,
  );
  const matchPlayers = await scalar("SELECT COUNT(*) AS n FROM match_players");
  const stats = await scalar("SELECT COUNT(*) AS n FROM stats");
  const submissionsTotal = await scalar("SELECT COUNT(*) AS n FROM player_stats_submissions");
  const submissionsApproved = await scalar(
    "SELECT COUNT(*) AS n FROM player_stats_submissions WHERE status = 'approved'",
  );
  const matchesStatsOn = await scalar(
    "SELECT COUNT(*) AS n FROM matches WHERE COALESCE(stats_scoring_enabled, 1) = 1",
  );
  const matchesTotal = await scalar("SELECT COUNT(*) AS n FROM matches");
  const goalsSum = await scalar("SELECT COALESCE(SUM(goals), 0) AS n FROM stats");
  const assistsSum = await scalar("SELECT COALESCE(SUM(assists), 0) AS n FROM stats");

  const perMatchRaw = (await sqlClient.query(
    `SELECT m.id AS match_id,
            COALESCE(m.played_on, '') AS played_on,
            COALESCE(m.stats_scoring_enabled, 1) AS stats_on,
            COUNT(DISTINCT mp.player_id) AS mp_count,
            COUNT(DISTINCT s.player_id)  AS stat_count,
            COUNT(DISTINCT pss.player_id) AS pss_approved_count,
            COUNT(DISTINCT v.voter_id) AS vote_count
     FROM matches m
     LEFT JOIN match_players mp ON mp.match_id = m.id
     LEFT JOIN stats s          ON s.match_id = m.id
     LEFT JOIN player_stats_submissions pss
            ON pss.match_id = m.id AND pss.status = 'approved'
     LEFT JOIN votes v          ON v.match_id = m.id
     GROUP BY m.id, m.played_on, m.stats_scoring_enabled
     ORDER BY m.id`,
  )) as unknown as {
    match_id: number;
    played_on: string;
    stats_on: number;
    mp_count: number;
    stat_count: number;
    pss_approved_count: number;
    vote_count: number;
  }[];
  const perMatch: PerMatchDiag[] = perMatchRaw.map((r) => ({
    matchId: r.match_id,
    playedOn: r.played_on,
    statsOn: Number(r.stats_on) === 1,
    players: Number(r.mp_count),
    statsRows: Number(r.stat_count),
    approvedSubs: Number(r.pss_approved_count),
    votes: Number(r.vote_count),
  }));

  // Run the exact stat sub-query the scoring engine uses.
  const activePids = (await sqlClient.query(
    "SELECT id FROM players WHERE active = 1",
  )) as unknown as { id: number }[];
  const pidList = activePids.map((r) => r.id);

  let engineStatRows = 0;
  let engineGoalsTotal = 0;
  let engineAssistsTotal = 0;
  if (pidList.length > 0) {
    const placeholders = pidList.map((_, i) => `$${i + 1}`).join(",");
    const engineRows = (await sqlClient.query(
      `SELECT mp.player_id, mp.match_id,
              COALESCE(s.goals, pss.goals, 0) AS goals,
              COALESCE(s.assists, pss.assists, 0) AS assists
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       JOIN matches m ON m.id = mp.match_id
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
       LEFT JOIN player_stats_submissions pss
              ON pss.match_id = mp.match_id
             AND pss.player_id = mp.player_id
             AND pss.status = 'approved'
       WHERE mp.player_id IN (${placeholders})
         AND COALESCE(m.stats_scoring_enabled, 1) = 1
         AND (s.player_id IS NOT NULL OR pss.player_id IS NOT NULL)`,
      pidList,
    )) as unknown as { goals: number; assists: number }[];
    engineStatRows = engineRows.length;
    engineGoalsTotal = engineRows.reduce((sum, r) => sum + Number(r.goals || 0), 0);
    engineAssistsTotal = engineRows.reduce((sum, r) => sum + Number(r.assists || 0), 0);
  }

  const warnings: string[] = [];
  if (goalsSum === 0 && assistsSum === 0) {
    warnings.push(
      "All stat rows have goals=0 and assists=0. Stats cannot differentiate players until real values are entered.",
    );
  }
  if (pidList.length === 0) {
    warnings.push("No active players found.");
  } else if (engineStatRows === 0) {
    warnings.push("Engine stat query returns 0 rows — scoring engine sees NO stat data.");
  } else if (engineGoalsTotal === 0 && engineAssistsTotal === 0) {
    warnings.push(
      `Engine finds ${engineStatRows} stat rows but ALL have goals=0, assists=0. Stat score will be 50 (neutral) for all.`,
    );
  }
  if (validVotes === 0) {
    warnings.push("No valid votes found — all peer scores will be 50 (neutral).");
  }
  if (submissionsApproved === 0 && stats === 0) {
    warnings.push("No approved stats found in either table — run Backfill in Scoring configuration.");
  } else if (stats === 0 && submissionsApproved > 0) {
    warnings.push(
      `${submissionsApproved} approved submission(s) exist but stats table is empty — run Backfill.`,
    );
  }

  return {
    totalVotes,
    validVotes,
    matchPlayers,
    stats,
    submissionsTotal,
    submissionsApproved,
    matchesStatsOn,
    matchesTotal,
    goalsSum,
    assistsSum,
    perMatch,
    engineStatRows,
    engineGoalsTotal,
    engineAssistsTotal,
    warnings,
  };
}
