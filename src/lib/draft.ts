import { sqlClient } from "@/lib/db";
import { getPlayerScores } from "@/lib/scoring";
import {
  listGuests,
  updateGuestTeam,
  updateGuestPosition,
  clearGuestTeams,
  deleteGuestsForHost,
} from "@/lib/guests";

// Allowed on-pitch positions (from the client-safe module).
import { POSITIONS, type Position } from "@/lib/positions";
export { POSITIONS, type Position };

export type AvailabilityStatus = "in" | "out" | "pending";
export type MatchdayStatus = "draft" | "active" | "closed";
export type MatchStatus = "open" | "closed";

// Guests are drafted alongside players. To reuse the numeric-id board and snake
// draft, a guest is represented with a NEGATIVE draft id (=-guest.id). Real
// players always have positive ids, so the sign disambiguates the two.
export function guestToDraftId(guestId: number): number {
  return -guestId;
}
export function isGuestDraftId(draftId: number): boolean {
  return draftId < 0;
}
export function draftIdToGuestId(draftId: number): number {
  return -draftId;
}

export interface DraftPlayer {
  playerId: number;
  name: string;
  preferredPosition: Position;
  positionPlayed: Position | null;
  teamNo: number | null;
  availStatus: AvailabilityStatus;
  score: number;
  isGuest?: boolean;
  hostName?: string;
}

export interface DraftState {
  matchId: number;
  numTeams: number;
  teamSize: number;
  status: MatchStatus;
  matchdayStatus: MatchdayStatus;
  players: DraftPlayer[];
}

// ---------------------------------------------------------------------------
// Pure snake-draft helpers (direct port of src/draft.py)
// ---------------------------------------------------------------------------

export function targetTeamSizes(playerCount: number, numTeams: number): number[] {
  const base = Math.floor(playerCount / numTeams);
  const remainder = playerCount % numTeams;
  const sizes = new Array<number>(numTeams).fill(base);
  for (let i = 0; i < remainder; i++) sizes[i] += 1;
  return sizes;
}

/**
 * Distribute already-ranked player ids across `numTeams` in a snake pattern.
 * Returns a map of teamNo (1-indexed) -> ordered player ids.
 */
export function snakeDraft(
  sortedPlayerIds: number[],
  numTeams: number,
): Record<number, number[]> {
  const teams: Record<number, number[]> = {};
  for (let t = 1; t <= numTeams; t++) teams[t] = [];

  const sizes = targetTeamSizes(sortedPlayerIds.length, numTeams);
  const teamIndices = Array.from({ length: numTeams }, (_, i) => i);
  let direction = 1;
  let pickIndex = 0;

  while (pickIndex < sortedPlayerIds.length) {
    const order = direction === 1 ? teamIndices : [...teamIndices].reverse();
    for (const idx of order) {
      if (pickIndex >= sortedPlayerIds.length) break;
      const teamNo = idx + 1;
      if (teams[teamNo].length >= sizes[idx]) continue;
      teams[teamNo].push(sortedPlayerIds[pickIndex]);
      pickIndex += 1;
    }
    direction *= -1;
  }

  return teams;
}

function normPosition(value: unknown): Position {
  const s = String(value ?? "").toUpperCase();
  return (POSITIONS as readonly string[]).includes(s) ? (s as Position) : "MID";
}

function normAvail(value: unknown): AvailabilityStatus {
  const s = String(value ?? "pending").toLowerCase();
  return s === "in" || s === "out" ? s : "pending";
}

function normMatchStatus(value: unknown): MatchStatus {
  return String(value ?? "open").toLowerCase() === "closed" ? "closed" : "open";
}

function normMatchday(value: unknown): MatchdayStatus {
  const s = String(value ?? "draft").toLowerCase();
  return s === "active" || s === "closed" ? s : "draft";
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

interface MatchMetaRow {
  id: number;
  num_teams: number | null;
  team_size: number | null;
  status: string | null;
  matchday_status: string | null;
}

interface CandidateRow {
  player_id: number;
  name: string;
  preferred_position: string | null;
  team_no: number | null;
  position_played: string | null;
  avail_status: string | null;
}

/**
 * Load the full draft state for a match: meta + the candidate pool.
 *
 * The candidate pool is every active player who is either already on the
 * roster (`match_players`) or has marked themselves available (`match_availability.status = 'in'`).
 * Returns null when the match does not exist.
 */
export async function getDraftState(matchId: number): Promise<DraftState | null> {
  const metaRaw = await sqlClient.query(
    `SELECT id, num_teams, team_size, status, matchday_status
       FROM matches WHERE id = $1`,
    [matchId],
  );
  const metaRows = metaRaw as MatchMetaRow[];
  if (metaRows.length === 0) return null;
  const meta = metaRows[0];

  const candidatesRaw = await sqlClient.query(
    `SELECT p.id AS player_id, p.name, p.preferred_position,
            mp.team_no, mp.position_played,
            COALESCE(ma.status, 'pending') AS avail_status
       FROM players p
       LEFT JOIN match_players mp
              ON mp.match_id = $1 AND mp.player_id = p.id
       LEFT JOIN match_availability ma
              ON ma.match_id = $1 AND ma.player_id = p.id
      WHERE p.active = 1
        AND (mp.player_id IS NOT NULL OR ma.status = 'in')
      ORDER BY p.name`,
    [matchId],
  );
  const candidateRows = candidatesRaw as CandidateRow[];

  const scores = await getPlayerScores();

  const players: DraftPlayer[] = candidateRows.map((r) => ({
    playerId: Number(r.player_id),
    name: r.name,
    preferredPosition: normPosition(r.preferred_position),
    positionPlayed: r.position_played == null ? null : normPosition(r.position_played),
    teamNo: r.team_no == null ? null : Number(r.team_no),
    availStatus: normAvail(r.avail_status),
    score: scores[Number(r.player_id)]?.final ?? 50,
  }));

  // Append guests as draftable entities using negative ids.
  const guests = await listGuests(matchId);
  for (const g of guests) {
    players.push({
      playerId: guestToDraftId(g.id),
      name: g.name,
      preferredPosition: g.position,
      positionPlayed: g.position,
      teamNo: g.teamNo,
      availStatus: "in",
      score: g.skill,
      isGuest: true,
      hostName: g.hostName,
    });
  }

  return {
    matchId: Number(meta.id),
    numTeams: Number(meta.num_teams ?? 2) || 2,
    teamSize: Number(meta.team_size ?? 0),
    status: normMatchStatus(meta.status),
    matchdayStatus: normMatchday(meta.matchday_status),
    players,
  };
}

// ---------------------------------------------------------------------------
// Write paths
// ---------------------------------------------------------------------------

interface Assignment {
  playerId: number;
  teamNo: number;
  position: Position;
}

async function insertMatchPlayers(matchId: number, rows: Assignment[]): Promise<void> {
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  for (const r of rows) {
    values.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(matchId, r.playerId, r.teamNo, r.position);
  }
  await sqlClient.query(
    `INSERT INTO match_players (match_id, player_id, team_no, position_played)
     VALUES ${values.join(", ")}`,
    params,
  );
}

async function insertPaymentsIfMissing(matchId: number, playerIds: number[]): Promise<void> {
  if (playerIds.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [matchId];
  let p = 2;
  for (const pid of playerIds) {
    values.push(`($1, $${p++}, 0)`);
    params.push(pid);
  }
  await sqlClient.query(
    `INSERT INTO payments (match_id, player_id, paid)
     VALUES ${values.join(", ")}
     ON CONFLICT (match_id, player_id) DO NOTHING`,
    params,
  );
}

/**
 * Auto-balance the candidate pool into `numTeams` using a snake draft ranked by
 * final score (highest first). Replaces the existing roster, mirrors the
 * Streamlit draft write (rebuild match_players + payments, persist team meta).
 * Returns the number of players drafted.
 */
export async function autoBalanceDraft(
  matchId: number,
  numTeams: number,
): Promise<number> {
  const state = await getDraftState(matchId);
  if (!state) throw new Error(`Match ${matchId} not found`);

  const pool = state.players;
  if (pool.length === 0) return 0;

  // Rank by score descending; ties broken by player id for determinism.
  const rankedIds = [...pool]
    .sort((a, b) => b.score - a.score || a.playerId - b.playerId)
    .map((p) => p.playerId);

  const posByPlayer = new Map<number, Position>(
    pool.map((p) => [p.playerId, p.positionPlayed ?? p.preferredPosition]),
  );

  const drafted = snakeDraft(rankedIds, numTeams);

  const assignments: Assignment[] = [];
  for (const [teamNoStr, pids] of Object.entries(drafted)) {
    const teamNo = Number(teamNoStr);
    for (const pid of pids) {
      assignments.push({
        playerId: pid,
        teamNo,
        position: posByPlayer.get(pid) ?? "MID",
      });
    }
  }

  // Split real players (positive id) from guests (negative id).
  const playerAssignments = assignments.filter((a) => a.playerId > 0);
  const guestAssignments = assignments.filter((a) => a.playerId < 0);

  await sqlClient.query(`DELETE FROM match_players WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM payments WHERE match_id = $1`, [matchId]);
  await insertMatchPlayers(matchId, playerAssignments);
  await insertPaymentsIfMissing(
    matchId,
    playerAssignments.map((a) => a.playerId),
  );

  // Persist guest team assignments (reset all first, then set the drafted ones).
  await clearGuestTeams(matchId);
  for (const a of guestAssignments) {
    await updateGuestTeam(draftIdToGuestId(a.playerId), a.teamNo);
  }

  await sqlClient.query(
    `UPDATE matches SET num_teams = $1, team_size = $2 WHERE id = $3`,
    [numTeams, Math.floor(assignments.length / numTeams), matchId],
  );

  return assignments.length;
}

/**
 * Persist a manual arrangement of the board. `assignments` are the players
 * placed on a team; `benchPlayerIds` are players moved off the roster.
 */
export async function saveDraftAssignments(
  matchId: number,
  assignments: Assignment[],
  benchPlayerIds: number[],
): Promise<void> {
  // Split real players (positive id) from guests (negative id).
  const playerAssignments = assignments.filter((a) => a.playerId > 0);
  const guestAssignments = assignments.filter((a) => a.playerId < 0);
  const benchedPlayerIds = benchPlayerIds.filter((id) => id > 0);
  const benchedGuestIds = benchPlayerIds.filter((id) => id < 0).map(draftIdToGuestId);

  // Remove benched players from the roster (and their payment rows).
  if (benchedPlayerIds.length > 0) {
    const placeholders = benchedPlayerIds.map((_, i) => `$${i + 2}`).join(", ");
    await sqlClient.query(
      `DELETE FROM match_players WHERE match_id = $1 AND player_id IN (${placeholders})`,
      [matchId, ...benchedPlayerIds],
    );
    await sqlClient.query(
      `DELETE FROM payments WHERE match_id = $1 AND player_id IN (${placeholders})`,
      [matchId, ...benchedPlayerIds],
    );
    // A benched player leaves the match, so their guests leave too.
    for (const hostId of benchedPlayerIds) {
      await deleteGuestsForHost(matchId, hostId);
    }
  }

  // Upsert the assigned players.
  for (const a of playerAssignments) {
    await sqlClient.query(
      `INSERT INTO match_players (match_id, player_id, team_no, position_played)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, player_id)
       DO UPDATE SET team_no = EXCLUDED.team_no, position_played = EXCLUDED.position_played`,
      [matchId, a.playerId, a.teamNo, a.position],
    );
  }
  await insertPaymentsIfMissing(
    matchId,
    playerAssignments.map((a) => a.playerId),
  );

  // Bench then (re)assign guests. Benched guests keep existing rows unless their
  // host was removed above (which already deleted them).
  for (const guestId of benchedGuestIds) {
    await updateGuestTeam(guestId, null);
  }
  for (const a of guestAssignments) {
    const guestId = draftIdToGuestId(a.playerId);
    await updateGuestTeam(guestId, a.teamNo);
    await updateGuestPosition(guestId, a.position);
  }

  const teamNos = new Set(assignments.map((a) => a.teamNo));
  const numTeams = Math.max(teamNos.size, 1);
  await sqlClient.query(`UPDATE matches SET team_size = $1 WHERE id = $2`, [
    Math.floor(assignments.length / numTeams),
    matchId,
  ]);
}

/**
 * Full reset: clears the draft and all match-scoped play data (votes, stats,
 * submissions, claims, payments, roster). Direct port of the Streamlit reset.
 */
export async function resetDraft(matchId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM vote_skips WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM votes WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM stats WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM player_stats_submissions WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM player_goals_claims WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM payments WHERE match_id = $1`, [matchId]);
  await sqlClient.query(`DELETE FROM match_players WHERE match_id = $1`, [matchId]);
  await clearGuestTeams(matchId);
  await sqlClient.query(`UPDATE matches SET team_size = 0 WHERE id = $1`, [matchId]);
}
