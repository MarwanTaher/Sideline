import { sqlClient } from "@/lib/db";

export type AvailabilityStatus = "in" | "out" | "pending";
export type MatchdayStatus = "draft" | "active" | "closed";

export interface PlayerAvailability {
  playerId: number;
  name: string;
  preferredPosition: string;
  status: AvailabilityStatus;
  updatedAt: string | null;
}

export interface AvailabilitySummary {
  inCount: number;
  outCount: number;
  pendingCount: number;
}

export interface AvailabilityMatch {
  id: number;
  playedOn: string;
  matchTime: string;
  matchdayStatus: MatchdayStatus;
}

function normMatchday(value: unknown): MatchdayStatus {
  const s = String(value ?? "draft").toLowerCase();
  return s === "active" || s === "closed" ? s : "draft";
}

/** Availability responses are only collected while the matchday is draft or active. */
export function availabilityOpen(status: MatchdayStatus): boolean {
  return status === "draft" || status === "active";
}

interface MatchMetaRow {
  id: number;
  played_on: string | null;
  match_time: string | null;
  matchday_status: string | null;
}

/** Load the minimal match meta needed by the availability screen, or null. */
export async function getAvailabilityMatch(
  matchId: number,
): Promise<AvailabilityMatch | null> {
  const raw = await sqlClient.query(
    `SELECT id, played_on, match_time, matchday_status
       FROM matches WHERE id = $1`,
    [matchId],
  );
  const rows = raw as MatchMetaRow[];
  if (rows.length === 0) return null;
  const m = rows[0];
  return {
    id: Number(m.id),
    playedOn: m.played_on ?? "",
    matchTime: m.match_time ?? "",
    matchdayStatus: normMatchday(m.matchday_status),
  };
}

interface AvailabilityRow {
  player_id: number;
  name: string;
  preferred_position: string | null;
  status: string;
  updated_at: string | null;
}

/**
 * Every active player with their in/out/pending status for a match.
 * Players with no row are reported as "pending" (synthetic — never stored).
 * Ordered in → pending → out, then by name (direct port of the Streamlit query).
 */
export async function getAvailabilityAllPlayers(
  matchId: number,
): Promise<PlayerAvailability[]> {
  const raw = await sqlClient.query(
    `SELECT p.id AS player_id, p.name, p.preferred_position,
            COALESCE(ma.status, 'pending') AS status,
            ma.updated_at
       FROM players p
       LEFT JOIN match_availability ma
              ON ma.match_id = $1 AND ma.player_id = p.id
      WHERE p.active = 1
      ORDER BY
        CASE COALESCE(ma.status, 'pending')
          WHEN 'in' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'out' THEN 2
        END,
        p.name`,
    [matchId],
  );
  const rows = raw as AvailabilityRow[];
  return rows.map((r) => ({
    playerId: Number(r.player_id),
    name: r.name,
    preferredPosition: r.preferred_position ?? "",
    status: (r.status === "in" || r.status === "out" ? r.status : "pending") as AvailabilityStatus,
    updatedAt: r.updated_at ?? null,
  }));
}

export function summarize(players: PlayerAvailability[]): AvailabilitySummary {
  let inCount = 0;
  let outCount = 0;
  let pendingCount = 0;
  for (const p of players) {
    if (p.status === "in") inCount++;
    else if (p.status === "out") outCount++;
    else pendingCount++;
  }
  return { inCount, outCount, pendingCount };
}

/**
 * Upsert a single player's in/out availability for a match.
 * Mirrors `_set_player_availability` in the Streamlit app.
 */
export async function setPlayerAvailability(
  matchId: number,
  playerId: number,
  status: "in" | "out",
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO match_availability (match_id, player_id, status, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (match_id, player_id)
     DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
    [matchId, playerId, status],
  );
}
