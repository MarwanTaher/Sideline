import "server-only";
import { sqlClient } from "./db";
import { getRoundOutcomes, groupRoundsByMatch, recordForTeam, winRate } from "./results";

/**
 * Seasons scope the leaderboard. Without them a two-year leader is
 * uncatchable and the table goes stale for anyone who joins late.
 *
 * A match belongs to a season by date range, so existing matches need no
 * backfill — `matches.season_id` stays available for explicit overrides later.
 */

export type SeasonStatus = "active" | "archived";

export type Season = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  status: SeasonStatus;
};

type SeasonRow = {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  status: string;
};

function toSeason(r: SeasonRow): Season {
  return {
    id: Number(r.id),
    name: String(r.name),
    startDate: String(r.start_date),
    endDate: r.end_date == null ? null : String(r.end_date),
    status: r.status === "archived" ? "archived" : "active",
  };
}

export async function listSeasons(): Promise<Season[]> {
  const rows = (await sqlClient.query(
    `SELECT id, name, start_date, end_date, status
       FROM seasons ORDER BY start_date DESC, id DESC`,
  )) as SeasonRow[];
  return rows.map(toSeason);
}

export async function getSeason(id: number): Promise<Season | null> {
  const rows = (await sqlClient.query(
    `SELECT id, name, start_date, end_date, status FROM seasons WHERE id = $1`,
    [id],
  )) as SeasonRow[];
  return rows.length > 0 ? toSeason(rows[0]) : null;
}

/** The season a "now" falls into — the newest active one that has started. */
export async function getCurrentSeason(): Promise<Season | null> {
  const rows = (await sqlClient.query(
    `SELECT id, name, start_date, end_date, status
       FROM seasons
      WHERE status = 'active'
        AND start_date <= to_char(NOW(), 'YYYY-MM-DD')
        AND (end_date IS NULL OR end_date >= to_char(NOW(), 'YYYY-MM-DD'))
      ORDER BY start_date DESC
      LIMIT 1`,
  )) as SeasonRow[];
  return rows.length > 0 ? toSeason(rows[0]) : null;
}

export async function createSeason(
  name: string,
  startDate: string,
  endDate: string | null,
): Promise<number> {
  const rows = (await sqlClient.query(
    `INSERT INTO seasons(name, start_date, end_date, status)
     VALUES ($1, $2, $3, 'active') RETURNING id`,
    [name.trim(), startDate, endDate || null],
  )) as Array<{ id: number }>;
  return Number(rows[0].id);
}

export async function updateSeason(
  id: number,
  name: string,
  startDate: string,
  endDate: string | null,
): Promise<void> {
  await sqlClient.query(
    `UPDATE seasons SET name = $1, start_date = $2, end_date = $3 WHERE id = $4`,
    [name.trim(), startDate, endDate || null, id],
  );
}

export async function setSeasonStatus(id: number, status: SeasonStatus): Promise<void> {
  await sqlClient.query(`UPDATE seasons SET status = $1 WHERE id = $2`, [status, id]);
}

export async function deleteSeason(id: number): Promise<void> {
  await sqlClient.query(`DELETE FROM seasons WHERE id = $1`, [id]);
}

/** Match ids inside a season's date range, for scoping stats and the table. */
export async function getSeasonMatchIds(seasonId: number): Promise<number[]> {
  const rows = (await sqlClient.query(
    `SELECT m.id
       FROM matches m
       JOIN seasons s ON s.id = $1
      WHERE m.played_on >= s.start_date
        AND (s.end_date IS NULL OR m.played_on <= s.end_date)`,
    [seasonId],
  )) as Array<{ id: number }>;
  return rows.map((r) => Number(r.id));
}

export type SeasonStandingRow = {
  playerId: number;
  name: string;
  photoUrl: string | null;
  matches: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  /** Null when the season's matches have no recorded rounds yet. */
  winRate: number | null;
};

/**
 * Season standings from what actually happened: appearances, approved goals and
 * assists, and mini-match results. Deliberately not the peer-vote score — that
 * engine blends every match ever played and is not season-scoped.
 */
export async function getSeasonStandings(
  seasonId: number,
): Promise<SeasonStandingRow[]> {
  const matchIds = await getSeasonMatchIds(seasonId);
  if (matchIds.length === 0) return [];

  const roster = (await sqlClient.query(
    `SELECT mp.match_id, mp.player_id, mp.team_no, p.name, p.photo_url,
            COALESCE(s.goals, 0) AS goals,
            COALESCE(s.assists, 0) AS assists
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
      WHERE mp.match_id = ANY($1) AND p.deleted_at IS NULL`,
    [matchIds],
  )) as Array<{
    match_id: number;
    player_id: number;
    team_no: number;
    name: string;
    photo_url: string | null;
    goals: number;
    assists: number;
  }>;

  const rounds = groupRoundsByMatch(await getRoundOutcomes(matchIds));
  const byPlayer = new Map<number, SeasonStandingRow>();

  for (const r of roster) {
    const id = Number(r.player_id);
    let row = byPlayer.get(id);
    if (!row) {
      row = {
        playerId: id,
        name: String(r.name),
        photoUrl: r.photo_url ?? null,
        matches: 0,
        goals: 0,
        assists: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: null,
      };
      byPlayer.set(id, row);
    }
    row.matches += 1;
    row.goals += Number(r.goals);
    row.assists += Number(r.assists);

    const rec = recordForTeam(rounds.get(Number(r.match_id)) ?? [], Number(r.team_no));
    row.wins += rec.wins;
    row.draws += rec.draws;
    row.losses += rec.losses;
  }

  const out = [...byPlayer.values()].map((row) => ({
    ...row,
    winRate: winRate({ wins: row.wins, draws: row.draws, losses: row.losses }),
  }));

  out.sort(
    (a, b) =>
      (b.winRate ?? -1) - (a.winRate ?? -1) ||
      b.matches - a.matches ||
      b.goals - a.goals,
  );
  return out;
}
