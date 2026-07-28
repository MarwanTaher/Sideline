import { sqlClient } from "@/lib/db";
import { getMatchDetail, type MatchTeam } from "@/lib/matches";

/**
 * Live matchday console.
 *
 * A matchday is usually a set of short, rotating games ("rounds") played by 2–3
 * teams over a couple of hours. This module tracks each round's scoreline, a
 * live log of who scored and who assisted, and a per-round stopwatch that can be
 * started, paused, resumed and reset (e.g. paused whenever the ball goes out).
 *
 * Time is kept in epoch milliseconds so the browser and the database agree
 * without any timezone math. While a round timer is paused, `elapsedMs` holds
 * the accumulated time; while running, the live value is
 * `elapsedMs + (Date.now() - startedAtMs)`.
 */

export type RoundStatus = "active" | "done";

/** Identifies a scorer/assister that may be a roster player or a drafted guest. */
export interface PersonRef {
  /** Roster player id, or null when the person is a guest. */
  playerId: number | null;
  /** Guest id, or null when the person is a roster player. */
  guestId: number | null;
  name: string;
}

export interface RoundGoal {
  id: number;
  roundId: number;
  teamNo: number;
  /** Null for an own goal (counts for the team, credited to no player). */
  scorer: PersonRef | null;
  assist: PersonRef | null;
  isOwnGoal: boolean;
  createdAt: string;
}

export interface MatchRound {
  id: number;
  roundNo: number;
  teamA: number;
  teamB: number;
  status: RoundStatus;
  scoreA: number;
  scoreB: number;
  goals: RoundGoal[];
  /** Stopwatch: accumulated ms while paused. */
  elapsedMs: number;
  running: boolean;
  /** Epoch ms the timer was last started, or null when paused. */
  startedAtMs: number | null;
}

export interface DayTally {
  key: string; // "p:<id>" | "g:<id>"
  name: string;
  goals: number;
  assists: number;
}

export interface MatchdayConsole {
  matchId: number;
  matchdayStatus: string;
  teams: MatchTeam[];
  teamNames: Record<number, string>;
  rounds: MatchRound[];
  tally: DayTally[];
  /** Server clock at read time, used by the client to correct for skew. */
  serverNowMs: number;
}

export class MatchdayError extends Error {}

// ── Reads ──────────────────────────────────────────────────────────────────

interface RoundRow {
  id: number;
  round_no: number;
  team_a: number;
  team_b: number;
  status: string;
  timer_running: number;
  elapsed_ms: string | number;
  started_at_ms: string | number | null;
}

interface GoalRow {
  id: number;
  round_id: number;
  team_no: number;
  scorer_player_id: number | null;
  scorer_guest_id: number | null;
  assist_player_id: number | null;
  assist_guest_id: number | null;
  scorer_name: string | null;
  assist_name: string | null;
  is_own_goal: number;
  created_at: string;
}

function personRef(
  playerId: number | null,
  guestId: number | null,
  name: string | null,
): PersonRef | null {
  if (playerId == null && guestId == null) return null;
  return {
    playerId: playerId != null ? Number(playerId) : null,
    guestId: guestId != null ? Number(guestId) : null,
    name: name ?? "Unknown",
  };
}

function personKey(ref: PersonRef): string {
  return ref.playerId != null ? `p:${ref.playerId}` : `g:${ref.guestId}`;
}

/** Full console state for a match: teams, rounds, live goals and day tallies. */
export async function getMatchdayConsole(
  matchId: number,
): Promise<MatchdayConsole | null> {
  const detail = await getMatchDetail(matchId);
  if (!detail) return null;

  const teamNames: Record<number, string> = {};
  for (const t of detail.teams) {
    if (t.name) teamNames[t.teamNo] = t.name;
  }

  const roundRows = (await sqlClient.query(
    `SELECT id, round_no, team_a, team_b, status,
            timer_running, elapsed_ms, started_at_ms
       FROM match_rounds
      WHERE match_id = $1
      ORDER BY round_no`,
    [matchId],
  )) as unknown as RoundRow[];

  const goalRows = (await sqlClient.query(
    `SELECT rg.id, rg.round_id, rg.team_no,
            rg.scorer_player_id, rg.scorer_guest_id,
            rg.assist_player_id, rg.assist_guest_id,
            COALESCE(sp.name, sg.name) AS scorer_name,
            COALESCE(ap.name, ag.name) AS assist_name,
            rg.is_own_goal,
            rg.created_at
       FROM round_goals rg
       LEFT JOIN players sp ON sp.id = rg.scorer_player_id
       LEFT JOIN match_guests sg ON sg.id = rg.scorer_guest_id
       LEFT JOIN players ap ON ap.id = rg.assist_player_id
       LEFT JOIN match_guests ag ON ag.id = rg.assist_guest_id
      WHERE rg.match_id = $1
      ORDER BY rg.created_at, rg.id`,
    [matchId],
  )) as unknown as GoalRow[];

  const goalsByRound = new Map<number, RoundGoal[]>();
  const tallyMap = new Map<string, DayTally>();

  for (const g of goalRows) {
    const isOwnGoal = Number(g.is_own_goal) === 1;
    const scorer = personRef(g.scorer_player_id, g.scorer_guest_id, g.scorer_name);
    const assist = personRef(g.assist_player_id, g.assist_guest_id, g.assist_name);
    const goal: RoundGoal = {
      id: Number(g.id),
      roundId: Number(g.round_id),
      teamNo: Number(g.team_no),
      scorer,
      assist,
      isOwnGoal,
      createdAt: String(g.created_at),
    };
    if (!goalsByRound.has(goal.roundId)) goalsByRound.set(goal.roundId, []);
    goalsByRound.get(goal.roundId)!.push(goal);

    if (scorer) {
      const sKey = personKey(scorer);
      const sTally = tallyMap.get(sKey) ?? { key: sKey, name: scorer.name, goals: 0, assists: 0 };
      sTally.goals += 1;
      tallyMap.set(sKey, sTally);
    }
    if (assist) {
      const aKey = personKey(assist);
      const aTally = tallyMap.get(aKey) ?? { key: aKey, name: assist.name, goals: 0, assists: 0 };
      aTally.assists += 1;
      tallyMap.set(aKey, aTally);
    }
  }

  const rounds: MatchRound[] = roundRows.map((r) => {
    const goals = goalsByRound.get(Number(r.id)) ?? [];
    let scoreA = 0;
    let scoreB = 0;
    for (const g of goals) {
      if (g.teamNo === Number(r.team_a)) scoreA += 1;
      else if (g.teamNo === Number(r.team_b)) scoreB += 1;
    }
    return {
      id: Number(r.id),
      roundNo: Number(r.round_no),
      teamA: Number(r.team_a),
      teamB: Number(r.team_b),
      status: r.status === "done" ? "done" : "active",
      scoreA,
      scoreB,
      goals,
      elapsedMs: Number(r.elapsed_ms),
      running: Number(r.timer_running) === 1,
      startedAtMs: r.started_at_ms != null ? Number(r.started_at_ms) : null,
    };
  });

  const tally = [...tallyMap.values()].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name),
  );

  return {
    matchId,
    matchdayStatus: detail.matchdayStatus,
    teams: detail.teams,
    teamNames,
    rounds,
    tally,
    serverNowMs: Date.now(),
  };
}

// ── Writes ─────────────────────────────────────────────────────────────────

async function requireMatchOpen(matchId: number): Promise<void> {
  const rows = (await sqlClient.query(
    `SELECT status, matchday_status FROM matches WHERE id = $1`,
    [matchId],
  )) as unknown as { status: string; matchday_status: string }[];
  const m = rows[0];
  if (!m) throw new MatchdayError("Match not found.");
  if (m.status === "closed" || m.matchday_status === "closed") {
    throw new MatchdayError("This matchday is closed.");
  }
}

/** Start a new round between two teams. Returns the new round id + number. */
export async function createRound(
  matchId: number,
  teamA: number,
  teamB: number,
): Promise<{ id: number; roundNo: number }> {
  if (teamA === teamB) throw new MatchdayError("Pick two different teams.");
  await requireMatchOpen(matchId);

  const nextRows = (await sqlClient.query(
    `SELECT COALESCE(MAX(round_no), 0) + 1 AS n FROM match_rounds WHERE match_id = $1`,
    [matchId],
  )) as unknown as { n: number }[];
  const roundNo = Number(nextRows[0]?.n ?? 1);

  const inserted = (await sqlClient.query(
    `INSERT INTO match_rounds(match_id, round_no, team_a, team_b, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id`,
    [matchId, roundNo, teamA, teamB],
  )) as unknown as { id: number }[];
  return { id: Number(inserted[0].id), roundNo };
}

/** Mark a round finished (stops its timer). */
export async function endRound(roundId: number): Promise<void> {
  await sqlClient.query(
    `UPDATE match_rounds
        SET status = 'done',
            elapsed_ms = elapsed_ms + CASE WHEN timer_running = 1 AND started_at_ms IS NOT NULL
                                           THEN $2 - started_at_ms ELSE 0 END,
            timer_running = 0,
            started_at_ms = NULL
      WHERE id = $1`,
    [roundId, Date.now()],
  );
}

/** Delete a round and all its goals. */
export async function deleteRound(roundId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM match_rounds WHERE id = $1`, [roundId]);
}

export type TimerAction = "start" | "pause" | "reset";

/** Drive a round's stopwatch: start/resume, pause, or reset to zero. */
export async function setRoundTimer(
  roundId: number,
  action: TimerAction,
): Promise<void> {
  const now = Date.now();
  if (action === "start") {
    // Only (re)start if not already running, so repeated taps don't lose time.
    await sqlClient.query(
      `UPDATE match_rounds
          SET timer_running = 1, started_at_ms = $2
        WHERE id = $1 AND timer_running = 0`,
      [roundId, now],
    );
  } else if (action === "pause") {
    await sqlClient.query(
      `UPDATE match_rounds
          SET elapsed_ms = elapsed_ms + CASE WHEN started_at_ms IS NOT NULL
                                             THEN $2 - started_at_ms ELSE 0 END,
              timer_running = 0,
              started_at_ms = NULL
        WHERE id = $1 AND timer_running = 1`,
      [roundId, now],
    );
  } else {
    await sqlClient.query(
      `UPDATE match_rounds
          SET elapsed_ms = 0, timer_running = 0, started_at_ms = NULL
        WHERE id = $1`,
      [roundId],
    );
  }
}

export interface AddGoalInput {
  roundId: number;
  teamNo: number;
  scorerPlayerId: number | null;
  scorerGuestId: number | null;
  assistPlayerId: number | null;
  assistGuestId: number | null;
  isOwnGoal?: boolean;
}

/** Log a goal in a round. Returns the new goal id. */
export async function addGoal(input: AddGoalInput): Promise<number> {
  const ownGoal = input.isOwnGoal === true;
  if (!ownGoal && input.scorerPlayerId == null && input.scorerGuestId == null) {
    throw new MatchdayError("Pick who scored.");
  }

  const roundRows = (await sqlClient.query(
    `SELECT match_id, team_a, team_b, status FROM match_rounds WHERE id = $1`,
    [input.roundId],
  )) as unknown as { match_id: number; team_a: number; team_b: number; status: string }[];
  const round = roundRows[0];
  if (!round) throw new MatchdayError("Round not found.");
  if (round.status === "done") throw new MatchdayError("This round is finished.");
  await requireMatchOpen(Number(round.match_id));
  if (input.teamNo !== Number(round.team_a) && input.teamNo !== Number(round.team_b)) {
    throw new MatchdayError("That team is not playing this round.");
  }

  const inserted = (await sqlClient.query(
    `INSERT INTO round_goals(round_id, match_id, team_no,
                             scorer_player_id, scorer_guest_id,
                             assist_player_id, assist_guest_id, is_own_goal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.roundId,
      Number(round.match_id),
      input.teamNo,
      ownGoal ? null : input.scorerPlayerId,
      ownGoal ? null : input.scorerGuestId,
      ownGoal ? null : input.assistPlayerId,
      ownGoal ? null : input.assistGuestId,
      ownGoal ? 1 : 0,
    ],
  )) as unknown as { id: number }[];
  return Number(inserted[0].id);
}

export interface UpdateGoalInput {
  goalId: number;
  scorerPlayerId: number | null;
  scorerGuestId: number | null;
  assistPlayerId: number | null;
  assistGuestId: number | null;
}

/** Correct who scored / assisted an already-logged (non-own) goal. */
export async function updateGoal(input: UpdateGoalInput): Promise<void> {
  if (input.scorerPlayerId == null && input.scorerGuestId == null) {
    throw new MatchdayError("Pick who scored.");
  }
  const rows = (await sqlClient.query(
    `SELECT rg.match_id, r.status
       FROM round_goals rg
       JOIN match_rounds r ON r.id = rg.round_id
      WHERE rg.id = $1`,
    [input.goalId],
  )) as unknown as { match_id: number; status: string }[];
  const row = rows[0];
  if (!row) throw new MatchdayError("Goal not found.");
  await requireMatchOpen(Number(row.match_id));
  await sqlClient.query(
    `UPDATE round_goals
        SET scorer_player_id = $2, scorer_guest_id = $3,
            assist_player_id = $4, assist_guest_id = $5,
            is_own_goal = 0
      WHERE id = $1`,
    [
      input.goalId,
      input.scorerPlayerId,
      input.scorerGuestId,
      input.assistPlayerId,
      input.assistGuestId,
    ],
  );
}

/** Remove a logged goal (e.g. tapped by mistake). */
export async function deleteGoal(goalId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM round_goals WHERE id = $1`, [goalId]);
}

/**
 * Roll the live goal/assist log up into the season `stats` table so it feeds the
 * existing scoring, leaderboards and awards. Only roster players are written
 * (the `stats` table keys on players); guest goals still appear in the live log.
 * Returns the number of player rows written.
 */
export async function syncMatchdayToStats(matchId: number): Promise<number> {
  await requireMatchOpen(matchId);

  const rows = (await sqlClient.query(
    `WITH scored AS (
        SELECT scorer_player_id AS player_id, COUNT(*) AS goals, 0 AS assists
          FROM round_goals
         WHERE match_id = $1 AND scorer_player_id IS NOT NULL
         GROUP BY scorer_player_id
        UNION ALL
        SELECT assist_player_id AS player_id, 0 AS goals, COUNT(*) AS assists
          FROM round_goals
         WHERE match_id = $1 AND assist_player_id IS NOT NULL
         GROUP BY assist_player_id
     )
     SELECT player_id, SUM(goals)::int AS goals, SUM(assists)::int AS assists
       FROM scored
      GROUP BY player_id`,
    [matchId],
  )) as unknown as { player_id: number; goals: number; assists: number }[];

  for (const r of rows) {
    await sqlClient.query(
      `INSERT INTO stats(match_id, player_id, goals, assists)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(match_id, player_id) DO UPDATE SET
         goals = EXCLUDED.goals,
         assists = EXCLUDED.assists`,
      [matchId, Number(r.player_id), Number(r.goals), Number(r.assists)],
    );
  }

  await sqlClient.query(
    `UPDATE matches SET stats_scoring_enabled = 1 WHERE id = $1`,
    [matchId],
  );

  return rows.length;
}

// ── Scorekeepers ────────────────────────────────────────────────────────────
//
// Admins can delegate live scoring for a specific match to trusted players
// ("scorekeepers") without granting them admin rights. A scorekeeper may run
// the whole console for that match; only admins can manage the scorekeeper list.

export interface Scorekeeper {
  playerId: number;
  name: string;
  photoUrl: string | null;
}

/** Players currently allowed to keep score for a match. */
export async function listScorekeepers(matchId: number): Promise<Scorekeeper[]> {
  const rows = (await sqlClient.query(
    `SELECT p.id, p.name, p.photo_url
       FROM match_scorekeepers ms
       JOIN players p ON p.id = ms.player_id
      WHERE ms.match_id = $1
      ORDER BY p.name`,
    [matchId],
  )) as unknown as { id: number; name: string; photo_url: string | null }[];
  return rows.map((r) => ({
    playerId: Number(r.id),
    name: r.name,
    photoUrl: r.photo_url ?? null,
  }));
}

/** Active players an admin can pick from when assigning scorekeepers. */
export async function listAssignablePlayers(): Promise<Scorekeeper[]> {
  const rows = (await sqlClient.query(
    `SELECT id, name, photo_url
       FROM players
      WHERE active = 1
      ORDER BY name`,
    [],
  )) as unknown as { id: number; name: string; photo_url: string | null }[];
  return rows.map((r) => ({
    playerId: Number(r.id),
    name: r.name,
    photoUrl: r.photo_url ?? null,
  }));
}

/** Grant a player scorekeeper access for a match (idempotent). */
export async function addScorekeeper(matchId: number, playerId: number): Promise<void> {
  await sqlClient.query(
    `INSERT INTO match_scorekeepers(match_id, player_id)
     VALUES ($1, $2)
     ON CONFLICT (match_id, player_id) DO NOTHING`,
    [matchId, playerId],
  );
}

/** Revoke a player's scorekeeper access for a match. */
export async function removeScorekeeper(matchId: number, playerId: number): Promise<void> {
  await sqlClient.query(
    `DELETE FROM match_scorekeepers WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  );
}

/** Whether a player is a scorekeeper for a match. */
export async function isScorekeeper(matchId: number, playerId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM match_scorekeepers WHERE match_id = $1 AND player_id = $2 LIMIT 1`,
    [matchId, playerId],
  )) as unknown as unknown[];
  return rows.length > 0;
}

/**
 * Whether the current viewer may run the matchday console for a match: real
 * admins/supers always can; other players can only if assigned as scorekeepers.
 */
export async function canRunMatchday(
  matchId: number,
  viewer: { role?: string | null; playerId?: number | null },
): Promise<boolean> {
  if (viewer.role === "admin" || viewer.role === "super") return true;
  if (viewer.playerId == null) return false;
  return isScorekeeper(matchId, viewer.playerId);
}
