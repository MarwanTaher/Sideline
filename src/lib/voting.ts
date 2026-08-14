import { sqlClient } from "@/lib/db";

export { MIN_RATING, MAX_RATING, DEFAULT_RATING } from "@/lib/voting-constants";

export type MatchdayStatus = "draft" | "active" | "closed";

export interface BallotPlayer {
  playerId: number;
  name: string;
  teamNo: number;
  photoUrl: string | null;
  priorRating: number | null;
  skipped: boolean;
}

export interface VotingState {
  matchId: number;
  matchdayStatus: MatchdayStatus;
  voterId: number;
  voterInRoster: boolean;
  hasVotedBefore: boolean;
  ballot: BallotPlayer[];
}

/** Voting is only open while the matchday is active. */
export function votingOpen(status: MatchdayStatus): boolean {
  return status === "active";
}

function normMatchday(value: unknown): MatchdayStatus {
  const s = String(value ?? "draft").toLowerCase();
  return s === "active" || s === "closed" ? s : "draft";
}

interface MatchdayRow {
  matchday_status: string | null;
}

interface RosterRow {
  player_id: number;
  name: string;
  team_no: number;
  photo_url: string | null;
}

interface PriorRow {
  voted_for_id: number;
  rating: number;
}

interface SkipRow {
  skipped_player_id: number;
}

/**
 * Load everything needed to render a player's ballot for a match.
 * Returns null when the match does not exist.
 *
 * Ballot = every rostered player except the voter. Each entry carries the
 * voter's prior rating (if any) and whether it should default to skipped
 * (persisted skip, or — for a re-vote — a player the voter never rated).
 */
export async function getVotingState(
  matchId: number,
  voterId: number,
): Promise<VotingState | null> {
  const metaRaw = await sqlClient.query(
    `SELECT matchday_status FROM matches WHERE id = $1`,
    [matchId],
  );
  const metaRows = metaRaw as MatchdayRow[];
  if (metaRows.length === 0) return null;
  const matchdayStatus = normMatchday(metaRows[0].matchday_status);

  const rosterRaw = await sqlClient.query(
    `SELECT mp.player_id, p.name, mp.team_no, p.photo_url
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = $1
      ORDER BY p.name`,
    [matchId],
  );
  const roster = rosterRaw as RosterRow[];

  const priorRaw = await sqlClient.query(
    `SELECT voted_for_id, rating FROM votes WHERE match_id = $1 AND voter_id = $2`,
    [matchId, voterId],
  );
  const priorRows = priorRaw as PriorRow[];
  const priorMap = new Map<number, number>(
    priorRows.map((r) => [Number(r.voted_for_id), Number(r.rating)]),
  );
  const hasVotedBefore = priorRows.length > 0;

  const skipsRaw = await sqlClient.query(
    `SELECT skipped_player_id FROM vote_skips WHERE match_id = $1 AND voter_id = $2`,
    [matchId, voterId],
  );
  const dbSkips = new Set<number>(
    (skipsRaw as SkipRow[]).map((r) => Number(r.skipped_player_id)),
  );

  const voterInRoster = roster.some((r) => Number(r.player_id) === voterId);

  const ballot: BallotPlayer[] = roster
    .filter((r) => Number(r.player_id) !== voterId)
    .map((r) => {
      const playerId = Number(r.player_id);
      const priorRating = priorMap.has(playerId) ? priorMap.get(playerId)! : null;
      const skipped =
        dbSkips.has(playerId) || (!priorMap.has(playerId) && hasVotedBefore);
      return {
        playerId,
        name: r.name,
        teamNo: Number(r.team_no),
        photoUrl: r.photo_url ?? null,
        priorRating,
        skipped,
      };
    });

  return { matchId, matchdayStatus, voterId, voterInRoster, hasVotedBefore, ballot };
}

export interface RatingInput {
  playerId: number;
  rating: number;
}

/**
 * A ballot where every rated player gets the exact same rating (the classic
 * "5 to everyone" that just skips through the form) carries no signal and would
 * only flatten the averages. Once at least this many players are rated with a
 * single identical value, the whole ballot is still saved but kept OUT of the
 * calculation (scope `out_of_scope`, include = 0) — no error is shown, the vote
 * simply doesn't count. Fixing any one rating so the ballot varies makes it
 * count again on the next submit.
 */
const UNIFORM_BALLOT_MIN_RATED = 10;

function isUniformBallot(ratings: RatingInput[]): boolean {
  if (ratings.length < UNIFORM_BALLOT_MIN_RATED) return false;
  const first = ratings[0].rating;
  return ratings.every((r) => r.rating === first);
}

export interface VoteObligation {
  matchId: number;
  playedOn: string;
}

/**
 * The most recent match a player was rostered in whose voting is still open
 * (matchday `active`) and for which they have cast no votes. Returns null when
 * they have no outstanding voting obligation. Used to nudge players to rate the
 * players from their last game before they can mark themselves available for a
 * new one — casting any vote clears the block.
 */
export async function getPendingVoteObligation(
  playerId: number,
  excludeMatchId?: number,
): Promise<VoteObligation | null> {
  const rows = (await sqlClient.query(
    `SELECT m.id, m.played_on
       FROM matches m
       JOIN match_players mp ON mp.match_id = m.id AND mp.player_id = $1
      WHERE m.matchday_status = 'active'
        AND m.id <> $2
        AND NOT EXISTS (
          SELECT 1 FROM votes v WHERE v.match_id = m.id AND v.voter_id = $1
        )
      ORDER BY m.played_on DESC, m.id DESC
      LIMIT 1`,
    [playerId, excludeMatchId ?? -1],
  )) as Array<{ id: number; played_on: string | null }>;
  if (rows.length === 0) return null;
  return { matchId: Number(rows[0].id), playedOn: rows[0].played_on ?? "" };
}

/**
 * Persist a player's ballot. Direct port of `submit_player_votes_only` plus the
 * skip bookkeeping from the Streamlit voting form.
 *
 * - On a re-vote, prior in-scope votes are moved out of calculation first.
 * - Rated players are upserted (include_in_calculation = 1, scope 'in_scope').
 * - Skipped players get a vote_skips row; rated players have theirs removed.
 *
 * Player submissions are intentionally NOT written to vote_audit (matches the
 * Streamlit behaviour — only admin edits are audited).
 */
export async function submitPlayerVotes(
  matchId: number,
  voterId: number,
  ratings: RatingInput[],
  skippedIds: number[],
  hasVotedBefore: boolean,
): Promise<void> {
  if (hasVotedBefore) {
    await sqlClient.query(
      `UPDATE votes
          SET include_in_calculation = 0, updated_at = CURRENT_TIMESTAMP
        WHERE match_id = $1 AND voter_id = $2 AND include_in_calculation = 1`,
      [matchId, voterId],
    );
  }

  // A ballot of identical ratings is saved but excluded from the calculation.
  const uniform = isUniformBallot(ratings);
  const includeFlag = uniform ? 0 : 1;
  const scope = uniform ? "out_of_scope" : "in_scope";

  for (const { playerId, rating } of ratings) {
    await sqlClient.query(
      `INSERT INTO votes
         (match_id, voter_id, voted_for_id, rating, include_in_calculation, scope_status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (match_id, voter_id, voted_for_id)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         include_in_calculation = EXCLUDED.include_in_calculation,
         scope_status = EXCLUDED.scope_status,
         updated_at = CURRENT_TIMESTAMP`,
      [matchId, voterId, playerId, rating, includeFlag, scope],
    );
  }

  if (skippedIds.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [matchId, voterId];
    let p = 3;
    for (const pid of skippedIds) {
      values.push(`($1, $2, $${p++})`);
      params.push(pid);
    }
    await sqlClient.query(
      `INSERT INTO vote_skips (match_id, voter_id, skipped_player_id)
       VALUES ${values.join(", ")}
       ON CONFLICT DO NOTHING`,
      params,
    );
  }

  const ratedIds = ratings.map((r) => r.playerId);
  if (ratedIds.length > 0) {
    const placeholders = ratedIds.map((_, i) => `$${i + 3}`).join(", ");
    await sqlClient.query(
      `DELETE FROM vote_skips
        WHERE match_id = $1 AND voter_id = $2 AND skipped_player_id IN (${placeholders})`,
      [matchId, voterId, ...ratedIds],
    );
  }
}
