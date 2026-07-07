import { sqlClient } from "@/lib/db";
import { notify } from "@/lib/push";

export type MatchdayStatus = "draft" | "active" | "closed";
export type MatchStatus = "open" | "closed";

export interface MatchAdmin {
  id: number;
  playedOn: string;
  matchTime: string;
  numTeams: number;
  teamSize: number;
  statsScoringEnabled: boolean;
  status: MatchStatus;
  matchdayStatus: MatchdayStatus;
}

export interface CreateMatchInput {
  playedOn: string; // YYYY-MM-DD
  matchTime: string; // "hh:mm am/pm"
  numTeams: number; // 2 | 3
  statsScoringEnabled: boolean;
}

export interface UpdateMatchInput {
  playedOn: string;
  matchTime: string;
  numTeams: number;
  statsScoringEnabled: boolean;
}

/**
 * Normalise a time into the "hh:mm am/pm" form the app stores (e.g. "09:00 pm").
 * Accepts a 24h "HH:MM" (from an <input type="time">) or an already-formatted
 * 12h string. Falls back to "09:00 pm" when it cannot be parsed.
 */
export function normalizeMatchTime(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "09:00 pm";

  // Already 12h "h:mm am/pm"
  const twelve = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (twelve) {
    const h = Math.min(12, Math.max(1, Number(twelve[1])));
    const m = Math.min(59, Number(twelve[2]));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${twelve[3]}`;
  }

  // 24h "HH:MM"
  const day = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (day) {
    let h = Number(day[1]);
    const m = Math.min(59, Number(day[2]));
    if (h < 0 || h > 23) return "09:00 pm";
    const period = h >= 12 ? "pm" : "am";
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }

  return "09:00 pm";
}

function normMatchday(value: unknown): MatchdayStatus {
  const s = String(value ?? "draft").toLowerCase();
  return s === "active" || s === "closed" ? s : "draft";
}

function normStatus(value: unknown): MatchStatus {
  return String(value ?? "open").toLowerCase() === "closed" ? "closed" : "open";
}

interface MatchAdminRow {
  id: number;
  played_on: string | null;
  match_time: string | null;
  num_teams: number | null;
  team_size: number | null;
  stats_scoring_enabled: number | null;
  status: string | null;
  matchday_status: string | null;
}

export async function getMatchAdmin(matchId: number): Promise<MatchAdmin | null> {
  const raw = await sqlClient.query(
    `SELECT id, played_on, match_time, num_teams, team_size,
            stats_scoring_enabled, status, matchday_status
       FROM matches WHERE id = $1`,
    [matchId],
  );
  const rows = raw as MatchAdminRow[];
  if (rows.length === 0) return null;
  const m = rows[0];
  return {
    id: Number(m.id),
    playedOn: m.played_on ?? "",
    matchTime: m.match_time ?? "",
    numTeams: Number(m.num_teams ?? 2),
    teamSize: Number(m.team_size ?? 0),
    statsScoringEnabled: Number(m.stats_scoring_enabled ?? 1) === 1,
    status: normStatus(m.status),
    matchdayStatus: normMatchday(m.matchday_status),
  };
}

/**
 * Create a new match. Mirrors the Streamlit create flow: team_size starts at 0
 * (set later by the draft), status 'open', matchday_status 'draft' (default).
 * Returns the new match id.
 */
export async function createMatch(input: CreateMatchInput): Promise<number> {
  const raw = await sqlClient.query(
    `INSERT INTO matches
       (played_on, match_time, num_teams, team_size, total_payment, stats_scoring_enabled, status)
     VALUES ($1, $2, $3, 0, 0, $4, 'open')
     RETURNING id`,
    [
      input.playedOn,
      normalizeMatchTime(input.matchTime),
      input.numTeams,
      input.statsScoringEnabled ? 1 : 0,
    ],
  );
  const rows = raw as { id: number }[];
  return Number(rows[0].id);
}

export async function updateMatchSettings(
  matchId: number,
  input: UpdateMatchInput,
): Promise<void> {
  await sqlClient.query(
    `UPDATE matches
        SET played_on = $1,
            match_time = $2,
            num_teams = $3,
            stats_scoring_enabled = $4
      WHERE id = $5`,
    [
      input.playedOn,
      normalizeMatchTime(input.matchTime),
      input.numTeams,
      input.statsScoringEnabled ? 1 : 0,
      matchId,
    ],
  );
}

/**
 * Move a match through its matchday lifecycle. Only one match may be 'active'
 * at a time — activating throws if another match is already active.
 */
export async function setMatchdayStatus(
  matchId: number,
  status: MatchdayStatus,
): Promise<void> {
  if (status === "active") {
    const raw = await sqlClient.query(
      `SELECT id FROM matches WHERE matchday_status = 'active' AND id <> $1 LIMIT 1`,
      [matchId],
    );
    const rows = raw as { id: number }[];
    if (rows.length > 0) {
      throw new Error(
        `Match ${Number(rows[0].id)} is already active. Close it before activating another.`,
      );
    }
  }
  await sqlClient.query(`UPDATE matches SET matchday_status = $1 WHERE id = $2`, [
    status,
    matchId,
  ]);

  if (status === "active") {
    // Notify subscribers that the match is live. Never let a push failure
    // block the status change.
    try {
      await notify("match_activated", {
        title: "Match is live \u26bd",
        body: `Match ${matchId} is now active \u2014 set your availability and get ready.`,
        url: `/matches/${matchId}`,
        tag: `match-${matchId}-active`,
      });
    } catch {
      // ignore push errors
    }
  }
}

export async function setMatchStatus(
  matchId: number,
  status: MatchStatus,
): Promise<void> {
  await sqlClient.query(`UPDATE matches SET status = $1 WHERE id = $2`, [status, matchId]);
}

/** Delete a match. All match-scoped data is removed via ON DELETE CASCADE. */
export async function deleteMatch(matchId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM matches WHERE id = $1`, [matchId]);
}
