import "server-only";
import { sqlClient } from "./db";
import { kickoffAtSql } from "./kickoff-sql";
import { kickoffMs } from "./match-schedule";
import { getTeamsPublishedAt } from "./moments";
import { getRoundOutcomes, groupRoundsByMatch } from "./results";
import { getCurrentSeason, getSeasonMatchIds } from "./seasons";
import { logAppError } from "./error-log";
import {
  isMatchdayScored,
  matchdayWinners,
  picksRevealed,
  predictionWindow,
  tallyPundits,
  type PredictionWindow,
  type PunditPick,
} from "./prediction-rules";

type MatchdayStatus = "draft" | "active" | "closed";

function normMatchday(s: unknown): MatchdayStatus {
  return s === "active" ? "active" : s === "closed" ? "closed" : "draft";
}

export type PredictionMatch = {
  matchId: number;
  matchdayStatus: MatchdayStatus;
  kickoffMs: number | null;
  teamsPublished: boolean;
  /** Team numbers on the published team sheet. */
  teamNos: number[];
};

/** Window inputs for one match, or null when the match does not exist. */
export async function getPredictionMatch(matchId: number): Promise<PredictionMatch | null> {
  const [metaResult, teamResult, publishedAt] = await Promise.all([
    sqlClient.query(
      `SELECT COALESCE(m.matchday_status, 'draft') AS matchday_status,
              ${kickoffAtSql("m")} AS kickoff_at
         FROM matches m
        WHERE m.id = $1::int`,
      [matchId],
    ),
    sqlClient.query(
      `SELECT team_no FROM match_players
        WHERE match_id = $1::int AND team_no IS NOT NULL AND team_no > 0
       UNION
       SELECT team_no FROM match_guests
        WHERE match_id = $1::int AND team_no IS NOT NULL AND team_no > 0 AND status = 'approved'
       ORDER BY team_no`,
      [matchId],
    ),
    getTeamsPublishedAt(matchId),
  ]);
  const metaRows = metaResult as Array<{ matchday_status: string; kickoff_at: string | Date | null }>;
  const teamRows = teamResult as Array<{ team_no: number }>;
  if (metaRows.length === 0) return null;
  return {
    matchId,
    matchdayStatus: normMatchday(metaRows[0].matchday_status),
    kickoffMs: kickoffMs(metaRows[0].kickoff_at),
    teamsPublished: publishedAt != null,
    teamNos: teamRows.map((r) => Number(r.team_no)),
  };
}

/** Whether the player exists and has not been deleted. */
export async function isPredictingPlayer(playerId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM players WHERE id = $1::int AND deleted_at IS NULL LIMIT 1`,
    [playerId],
  )) as unknown[];
  return rows.length > 0;
}

/**
 * Upsert a pick. The kickoff check is repeated in SQL against the database
 * clock so a request racing kickoff cannot slip through. False = locked.
 */
export async function savePrediction(
  matchId: number,
  playerId: number,
  teamNo: number,
): Promise<boolean> {
  const rows = (await sqlClient.query(
    `INSERT INTO predictions (match_id, player_id, team_no)
     SELECT $1::int, $2::int, $3::int
       FROM matches m
      WHERE m.id = $1::int
        AND COALESCE(m.matchday_status, 'draft') <> 'closed'
        AND ${kickoffAtSql("m")} > now()
     ON CONFLICT (match_id, player_id)
     DO UPDATE SET team_no = EXCLUDED.team_no, updated_at = now()
     RETURNING id`,
    [matchId, playerId, teamNo],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

export type MatchPredictionView = {
  window: PredictionWindow;
  /** Others' picks are visible (kickoff passed or matchday closed). */
  revealed: boolean;
  total: number;
  myPick: number | null;
  /** Picks per team number; only filled once revealed. */
  distribution: Record<number, number> | null;
  /** Tied leaders once the matchday is closed and scored; else null. */
  winners: number[] | null;
  /** Closed with completed rounds — correctness is final. */
  scored: boolean;
  /** Matchday closed. With `scored` false it means no result to score. */
  closed: boolean;
};

async function loadMatchPredictionView(
  matchId: number,
  viewerPlayerId: number | null,
  nowMs: number,
): Promise<MatchPredictionView | null> {
  const ctx = await getPredictionMatch(matchId);
  if (!ctx || !ctx.teamsPublished) return null;

  const rows = (await sqlClient.query(
    `SELECT pr.player_id, pr.team_no
       FROM predictions pr
       JOIN players p ON p.id = pr.player_id AND p.deleted_at IS NULL
      WHERE pr.match_id = $1::int`,
    [matchId],
  )) as Array<{ player_id: number; team_no: number }>;

  const timing = { kickoffMs: ctx.kickoffMs, matchdayStatus: ctx.matchdayStatus, nowMs };
  const revealed = picksRevealed(timing);
  const mine = viewerPlayerId != null ? rows.find((r) => Number(r.player_id) === viewerPlayerId) : undefined;

  let distribution: Record<number, number> | null = null;
  if (revealed) {
    distribution = {};
    for (const r of rows) {
      const team = Number(r.team_no);
      distribution[team] = (distribution[team] ?? 0) + 1;
    }
  }

  let winners: number[] | null = null;
  if (ctx.matchdayStatus === "closed") {
    winners = matchdayWinners(await getRoundOutcomes([matchId]));
  }

  return {
    window: predictionWindow({ ...timing, teamsPublished: ctx.teamsPublished }),
    revealed,
    total: rows.length,
    myPick: mine ? Number(mine.team_no) : null,
    distribution,
    winners,
    scored: isMatchdayScored(ctx.matchdayStatus, winners),
    closed: ctx.matchdayStatus === "closed",
  };
}

/**
 * Card data for the match overview, or null when teams are unpublished. A
 * failure (e.g. migration 0033 not yet deployed) hides the card instead of
 * breaking the match page.
 */
export async function getMatchPredictionView(
  matchId: number,
  viewerPlayerId: number | null,
  nowMs: number = Date.now(),
): Promise<MatchPredictionView | null> {
  try {
    return await loadMatchPredictionView(matchId, viewerPlayerId, nowMs);
  } catch (error) {
    await logAppError(error, "predictions.view");
    return null;
  }
}

export type PunditRow = {
  playerId: number;
  name: string;
  photoUrl: string | null;
  points: number;
  /** Predictions made on scored matchdays. */
  scored: number;
};

export type PunditStandings = {
  allTime: PunditRow[];
  season: { id: number; name: string; rows: PunditRow[] } | null;
};

async function loadPunditStandings(): Promise<PunditStandings> {
  const pickRows = (await sqlClient.query(
    `SELECT pr.match_id, pr.player_id, pr.team_no
       FROM predictions pr
       JOIN matches m ON m.id = pr.match_id
       JOIN players p ON p.id = pr.player_id AND p.deleted_at IS NULL
      WHERE m.matchday_status = 'closed'`,
  )) as Array<{ match_id: number; player_id: number; team_no: number }>;

  const picks: PunditPick[] = pickRows.map((r) => ({
    matchId: Number(r.match_id),
    playerId: Number(r.player_id),
    teamNo: Number(r.team_no),
  }));
  const matchIds = [...new Set(picks.map((p) => p.matchId))];

  // "Current season" matches the leaderboard's season tables: the newest
  // active season containing today (getCurrentSeason), with matches assigned
  // by played_on date range (getSeasonMatchIds) rather than matches.season_id.
  const [rounds, season] = await Promise.all([
    getRoundOutcomes(matchIds),
    getCurrentSeason(),
  ]);
  const seasonMatchIds = season ? new Set(await getSeasonMatchIds(season.id)) : null;

  const winnersByMatch = new Map<number, number[]>();
  for (const [matchId, matchRounds] of groupRoundsByMatch(rounds)) {
    const winners = matchdayWinners(matchRounds);
    if (winners) winnersByMatch.set(matchId, winners);
  }

  const allTally = tallyPundits(picks, winnersByMatch);
  const seasonTally = seasonMatchIds
    ? tallyPundits(
        picks.filter((p) => seasonMatchIds.has(p.matchId)),
        winnersByMatch,
      )
    : null;

  const playerIds = allTally.map((t) => t.playerId);
  const people = new Map<number, { name: string; photoUrl: string | null }>();
  if (playerIds.length > 0) {
    const rows = (await sqlClient.query(
      `SELECT id, name, photo_url FROM players WHERE id = ANY($1::int[])`,
      [playerIds],
    )) as Array<{ id: number; name: string; photo_url: string | null }>;
    for (const r of rows) people.set(Number(r.id), { name: String(r.name), photoUrl: r.photo_url ?? null });
  }

  const withNames = (tally: ReturnType<typeof tallyPundits>): PunditRow[] =>
    tally.map((t) => ({
      ...t,
      name: people.get(t.playerId)?.name ?? "Player",
      photoUrl: people.get(t.playerId)?.photoUrl ?? null,
    }));

  return {
    allTime: withNames(allTally),
    season:
      season && seasonTally ? { id: season.id, name: season.name, rows: withNames(seasonTally) } : null,
  };
}

/** Pundit tables; null on failure so the awards page still renders. */
export async function getPunditStandings(): Promise<PunditStandings | null> {
  try {
    return await loadPunditStandings();
  } catch (error) {
    await logAppError(error, "predictions.standings");
    return null;
  }
}
