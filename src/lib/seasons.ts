import "server-only";
import { sqlClient } from "./db";

/**
 * Seasons give the competition a natural reset and archive. The skill rating
 * engine stays all-time (a "soft reset"): a season provides a stats-based
 * sub-ranking (appearances / goals / assists / wins) scoped to its matches,
 * without disturbing hard-won all-time standings.
 */

export type SeasonStatus = "active" | "archived";
export type SeasonResetMode = "soft" | "hard";

export type Season = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  status: SeasonStatus;
  resetMode: SeasonResetMode;
  matchCount: number;
};

export type SeasonStatRow = {
  playerId: number;
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  wins: number;
};

function mapSeason(r: {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  status: string;
  reset_mode: string;
  match_count: number;
}): Season {
  return {
    id: Number(r.id),
    name: String(r.name),
    startDate: String(r.start_date),
    endDate: r.end_date == null ? null : String(r.end_date),
    status: r.status === "archived" ? "archived" : "active",
    resetMode: r.reset_mode === "hard" ? "hard" : "soft",
    matchCount: Number(r.match_count),
  };
}

export async function listSeasons(): Promise<Season[]> {
  const rows = (await sqlClient.query(
    `SELECT s.id, s.name, s.start_date, s.end_date, s.status, s.reset_mode,
            COUNT(m.id) AS match_count
       FROM seasons s
       LEFT JOIN matches m ON m.season_id = s.id
      GROUP BY s.id
      ORDER BY s.start_date DESC, s.id DESC`,
  )) as Array<Parameters<typeof mapSeason>[0]>;
  return rows.map(mapSeason);
}

export async function getActiveSeason(): Promise<Season | null> {
  const rows = (await sqlClient.query(
    `SELECT s.id, s.name, s.start_date, s.end_date, s.status, s.reset_mode,
            COUNT(m.id) AS match_count
       FROM seasons s
       LEFT JOIN matches m ON m.season_id = s.id
      WHERE s.status = 'active'
      GROUP BY s.id
      ORDER BY s.start_date DESC, s.id DESC
      LIMIT 1`,
  )) as Array<Parameters<typeof mapSeason>[0]>;
  return rows.length ? mapSeason(rows[0]) : null;
}

export async function getSeason(id: number): Promise<Season | null> {
  const rows = (await sqlClient.query(
    `SELECT s.id, s.name, s.start_date, s.end_date, s.status, s.reset_mode,
            COUNT(m.id) AS match_count
       FROM seasons s
       LEFT JOIN matches m ON m.season_id = s.id
      WHERE s.id = $1
      GROUP BY s.id`,
    [id],
  )) as Array<Parameters<typeof mapSeason>[0]>;
  return rows.length ? mapSeason(rows[0]) : null;
}

/**
 * Create a season and make it the active one. Archives any currently-active
 * season (only one active at a time). Existing unassigned matches are NOT
 * back-tagged automatically.
 */
export async function createSeason(input: {
  name: string;
  startDate: string;
  resetMode: SeasonResetMode;
}): Promise<number> {
  await sqlClient.query(
    `UPDATE seasons SET status = 'archived', end_date = COALESCE(end_date, $1)
      WHERE status = 'active'`,
    [input.startDate],
  );
  const rows = (await sqlClient.query(
    `INSERT INTO seasons (name, start_date, status, reset_mode)
     VALUES ($1, $2, 'active', $3)
     RETURNING id`,
    [input.name.slice(0, 60), input.startDate, input.resetMode],
  )) as Array<{ id: number }>;
  return Number(rows[0].id);
}

export async function archiveSeason(id: number, endDate: string): Promise<void> {
  await sqlClient.query(
    `UPDATE seasons SET status = 'archived', end_date = $2 WHERE id = $1`,
    [id, endDate],
  );
}

/** Tag a match with the currently active season, if any. Safe to call on create. */
export async function assignMatchToActiveSeason(matchId: number): Promise<void> {
  const season = await getActiveSeason();
  if (!season) return;
  await sqlClient.query(
    `UPDATE matches SET season_id = $1 WHERE id = $2 AND season_id IS NULL`,
    [season.id, matchId],
  );
}

/**
 * Stats sub-ranking for a season (or all-time when seasonId is null). Wins are
 * derived from approved goals: the team with the most goals in a match wins;
 * draws award nobody.
 */
export async function getSeasonStats(seasonId: number | null): Promise<SeasonStatRow[]> {
  const rows = (await sqlClient.query(
    `SELECT mp.match_id, mp.player_id, mp.team_no, p.name,
            COALESCE(s.goals, 0) AS goals,
            COALESCE(s.assists, 0) AS assists
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
      WHERE ($1::int IS NULL OR m.season_id = $1)`,
    [seasonId],
  )) as Array<{
    match_id: number;
    player_id: number;
    team_no: number;
    name: string;
    goals: number;
    assists: number;
  }>;

  // Team goal totals per match to decide winners.
  const teamGoals = new Map<string, number>(); // `${matchId}:${teamNo}` -> goals
  for (const r of rows) {
    const key = `${r.match_id}:${r.team_no}`;
    teamGoals.set(key, (teamGoals.get(key) ?? 0) + Number(r.goals));
  }
  const winnerByMatch = new Map<number, number | null>(); // matchId -> winning teamNo (null = draw)
  const matchTeams = new Map<number, Map<number, number>>();
  for (const [key, goals] of teamGoals) {
    const [midStr, tnoStr] = key.split(":");
    const mid = Number(midStr);
    const tno = Number(tnoStr);
    if (!matchTeams.has(mid)) matchTeams.set(mid, new Map());
    matchTeams.get(mid)!.set(tno, goals);
  }
  for (const [mid, teams] of matchTeams) {
    let best = -1;
    let winner: number | null = null;
    let tie = false;
    for (const [tno, goals] of teams) {
      if (goals > best) {
        best = goals;
        winner = tno;
        tie = false;
      } else if (goals === best) {
        tie = true;
      }
    }
    winnerByMatch.set(mid, tie || best <= 0 ? null : winner);
  }

  const agg = new Map<number, SeasonStatRow>();
  for (const r of rows) {
    const pid = Number(r.player_id);
    let row = agg.get(pid);
    if (!row) {
      row = { playerId: pid, name: String(r.name), appearances: 0, goals: 0, assists: 0, wins: 0 };
      agg.set(pid, row);
    }
    row.appearances += 1;
    row.goals += Number(r.goals);
    row.assists += Number(r.assists);
    if (winnerByMatch.get(Number(r.match_id)) === Number(r.team_no)) row.wins += 1;
  }

  return [...agg.values()].sort(
    (a, b) => b.wins - a.wins || b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name),
  );
}
