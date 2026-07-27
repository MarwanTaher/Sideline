import "server-only";
import { sqlClient } from "./db";

/**
 * Man of the Match: a lightweight, explicit peer vote separate from the skill
 * rating. One vote per player per match; you can't vote for yourself. Kept
 * match-scoped and simple — this is banter, not a second rating engine.
 */

export type MotmTallyRow = {
  playerId: number;
  name: string;
  votes: number;
};

/** Roster player ids for a match (real players only, guests excluded). */
async function rosterPlayerIds(matchId: number): Promise<Set<number>> {
  const rows = (await sqlClient.query(
    `SELECT player_id FROM match_players WHERE match_id = $1`,
    [matchId],
  )) as Array<{ player_id: number }>;
  return new Set(rows.map((r) => Number(r.player_id)));
}

/**
 * Cast or change a MOTM vote. Both voter and nominee must be on the roster and
 * differ. Returns false when the vote is not allowed.
 */
export async function castMotmVote(
  matchId: number,
  voterId: number,
  votedForId: number,
): Promise<boolean> {
  if (voterId === votedForId) return false;
  const roster = await rosterPlayerIds(matchId);
  if (!roster.has(voterId) || !roster.has(votedForId)) return false;

  await sqlClient.query(
    `INSERT INTO match_motm_votes (match_id, voter_id, voted_for_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (match_id, voter_id)
     DO UPDATE SET voted_for_id = EXCLUDED.voted_for_id, created_at = CURRENT_TIMESTAMP`,
    [matchId, voterId, votedForId],
  );
  return true;
}

/** Who a given voter picked for MOTM in this match, if anyone. */
export async function getMotmVote(
  matchId: number,
  voterId: number,
): Promise<number | null> {
  const rows = (await sqlClient.query(
    `SELECT voted_for_id FROM match_motm_votes WHERE match_id = $1 AND voter_id = $2`,
    [matchId, voterId],
  )) as Array<{ voted_for_id: number }>;
  return rows.length ? Number(rows[0].voted_for_id) : null;
}

/** Full tally, most votes first. */
export async function getMotmTally(matchId: number): Promise<MotmTallyRow[]> {
  const rows = (await sqlClient.query(
    `SELECT v.voted_for_id AS player_id, p.name, COUNT(*) AS votes
       FROM match_motm_votes v
       JOIN players p ON p.id = v.voted_for_id
      WHERE v.match_id = $1
      GROUP BY v.voted_for_id, p.name
      ORDER BY votes DESC, p.name ASC`,
    [matchId],
  )) as Array<{ player_id: number; name: string; votes: number }>;
  return rows.map((r) => ({
    playerId: Number(r.player_id),
    name: String(r.name),
    votes: Number(r.votes),
  }));
}

/** The current MOTM winner (top of the tally), or null when no votes yet. */
export async function getMotmWinner(matchId: number): Promise<MotmTallyRow | null> {
  const tally = await getMotmTally(matchId);
  return tally.length ? tally[0] : null;
}

/** Total number of MOTM votes cast for a match. */
export async function getMotmVoteCount(matchId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT COUNT(*) AS n FROM match_motm_votes WHERE match_id = $1`,
    [matchId],
  )) as Array<{ n: number }>;
  return rows.length ? Number(rows[0].n) : 0;
}

export type MotmVoteDetailRow = {
  voterName: string;
  votedForName: string;
  createdAt: string;
};

/** Individual MOTM ballots for a match (who voted for whom) — admin review. */
export async function getMotmVoteDetails(matchId: number): Promise<MotmVoteDetailRow[]> {
  const rows = (await sqlClient.query(
    `SELECT voter.name AS voter_name,
            pick.name AS voted_for_name,
            v.created_at AS created_at
       FROM match_motm_votes v
       JOIN players voter ON voter.id = v.voter_id
       JOIN players pick ON pick.id = v.voted_for_id
      WHERE v.match_id = $1
      ORDER BY pick.name ASC, voter.name ASC`,
    [matchId],
  )) as Array<{ voter_name: string; voted_for_name: string; created_at: string }>;
  return rows.map((r) => ({
    voterName: String(r.voter_name),
    votedForName: String(r.voted_for_name),
    createdAt: String(r.created_at ?? ""),
  }));
}
