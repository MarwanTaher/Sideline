import { sqlClient } from "./db";

/** Matchday lifecycle state stored on `matches.matchday_status`. */
export type MatchdayStatus = "draft" | "active" | "closed";
export type MatchStatus = "open" | "closed";

export interface MatchListItem {
  id: number;
  playedOn: string;
  matchTime: string;
  kickoffAt: string | null;
  matchdayStatus: MatchdayStatus;
  status: MatchStatus;
  statsScoringEnabled: boolean;
  playerCount: number;
  availabilityOpen: boolean;
  locationName: string;
}

export interface MatchTeamPlayer {
  playerId: number;
  name: string;
  position: string;
  photoUrl?: string | null;
  isGuest?: boolean;
  hostName?: string;
}

export interface MatchTeam {
  teamNo: number;
  name?: string;
  players: MatchTeamPlayer[];
}

export interface MatchStatRow {
  name: string;
  goals: number;
  assists: number;
}

export interface MatchDetail {
  id: number;
  playedOn: string;
  matchTime: string;
  numTeams: number;
  teamSize: number;
  status: MatchStatus;
  matchdayStatus: MatchdayStatus;
  statsScoringEnabled: boolean;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  venue: "indoor" | "outdoor" | null;
  teams: MatchTeam[];
  stats: MatchStatRow[];
}

// Re-exported from the client-safe module so existing importers keep working.
export { fmtDate, fmtMatchTime } from "@/lib/format";

function normStatus(s: unknown): MatchStatus {
  return s === "closed" ? "closed" : "open";
}

function normMatchday(s: unknown): MatchdayStatus {
  return s === "active" ? "active" : s === "closed" ? "closed" : "draft";
}

// Parse the matches.team_names JSON column into a { teamNo: name } map.
function parseTeamNames(value: unknown): Record<number, string> {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const obj = JSON.parse(value) as Record<string, unknown>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(k);
      if (Number.isFinite(n) && typeof v === "string" && v.trim() !== "") {
        out[n] = v.trim().slice(0, 40);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** All matches, newest-first, with participant counts. */
export async function getMatchList(forPlayerId?: number | null): Promise<MatchListItem[]> {
  const restrict = typeof forPlayerId === "number";
  const rows = (await sqlClient.query(
    `
    SELECT m.id,
           m.played_on,
           COALESCE(m.match_time, '') AS match_time,
           m.kickoff_at,
           COALESCE(m.matchday_status, 'draft') AS matchday_status,
           COALESCE(m.status, 'open') AS status,
           COALESCE(m.stats_scoring_enabled, 1) AS stats_scoring_enabled,
           COALESCE(m.availability_open, 1) AS availability_open,
           COALESCE(m.location_name, '') AS location_name,
           COUNT(mp.player_id) AS player_count
    FROM matches m
    LEFT JOIN match_players mp ON mp.match_id = m.id
    ${restrict ? "WHERE (EXISTS (SELECT 1 FROM match_players mpx WHERE mpx.match_id = m.id AND mpx.player_id = $1) OR COALESCE(m.matchday_status, 'draft') IN ('draft', 'active'))" : ""}
    GROUP BY m.id, m.played_on, m.match_time, m.kickoff_at, m.matchday_status, m.status, m.stats_scoring_enabled, m.availability_open, m.location_name
    ORDER BY m.id DESC
    `,
    restrict ? [forPlayerId] : [],
  )) as Array<{
    id: number;
    played_on: string;
    match_time: string;
    kickoff_at: string | Date | null;
    matchday_status: string;
    status: string;
    stats_scoring_enabled: number;
    availability_open: number;
    location_name: string;
    player_count: number;
  }>;

  return rows.map((r) => ({
    id: Number(r.id),
    playedOn: String(r.played_on),
    matchTime: String(r.match_time),
    kickoffAt:
      r.kickoff_at == null
        ? null
        : r.kickoff_at instanceof Date
          ? r.kickoff_at.toISOString()
          : String(r.kickoff_at),
    matchdayStatus: normMatchday(r.matchday_status),
    status: normStatus(r.status),
    statsScoringEnabled: Number(r.stats_scoring_enabled) === 1,
    playerCount: Number(r.player_count),
    availabilityOpen: Number(r.availability_open) === 1,
    locationName: String(r.location_name ?? ""),
  }));
}

/**
 * Whether a player is part of a match — i.e. appears on its drafted teams
 * (`match_players`). This is the authorization gate for viewing a match and
 * its team formations.
 */
export async function isPlayerInMatch(matchId: number, playerId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM match_players WHERE match_id = $1 AND player_id = $2 LIMIT 1`,
    [Math.trunc(matchId), Math.trunc(playerId)],
  )) as unknown[];
  return rows.length > 0;
}

/** Full detail for a single match, or null if it does not exist. */
export async function getMatchDetail(matchId: number): Promise<MatchDetail | null> {
  const mid = Math.trunc(matchId);

  const metaRows = (await sqlClient.query(
    `
    SELECT id,
           played_on,
           COALESCE(match_time, '') AS match_time,
           num_teams,
           team_size,
           COALESCE(status, 'open') AS status,
           COALESCE(matchday_status, 'draft') AS matchday_status,
           COALESCE(stats_scoring_enabled, 1) AS stats_scoring_enabled,
           COALESCE(location_name, '') AS location_name,
           location_lat,
           location_lng,
           venue,
           team_names
    FROM matches
    WHERE id = $1
    `,
    [mid],
  )) as Array<{
    id: number;
    played_on: string;
    match_time: string;
    num_teams: number;
    team_size: number;
    status: string;
    matchday_status: string;
    stats_scoring_enabled: number;
    location_name: string;
    location_lat: number | null;
    location_lng: number | null;
    venue: string | null;
    team_names: string | null;
  }>;

  if (metaRows.length === 0) return null;
  const meta = metaRows[0];
  const teamNames = parseTeamNames(meta.team_names);

  const rosterRows = (await sqlClient.query(
    `
    SELECT mp.player_id, mp.team_no, p.name, mp.position_played, p.photo_url
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    WHERE mp.match_id = $1
    ORDER BY mp.team_no, p.name
    `,
    [mid],
  )) as Array<{ player_id: number; team_no: number; name: string; position_played: string; photo_url: string | null }>;

  const teamMap = new Map<number, MatchTeamPlayer[]>();
  for (const r of rosterRows) {
    const teamNo = Number(r.team_no);
    if (!teamMap.has(teamNo)) teamMap.set(teamNo, []);
    teamMap.get(teamNo)!.push({
      playerId: Number(r.player_id),
      name: String(r.name),
      position: String(r.position_played),
      photoUrl: r.photo_url ?? null,
    });
  }

  // Add drafted guests (team_no set) to their teams.
  const guestRows = (await sqlClient.query(
    `
    SELECT g.id, g.team_no, g.name, g.position, h.name AS host_name
    FROM match_guests g
    JOIN players h ON h.id = g.host_player_id
    WHERE g.match_id = $1 AND g.team_no IS NOT NULL AND g.status = 'approved'
    ORDER BY g.team_no, g.name
    `,
    [mid],
  )) as Array<{ id: number; team_no: number; name: string; position: string; host_name: string }>;
  for (const r of guestRows) {
    const teamNo = Number(r.team_no);
    if (!teamMap.has(teamNo)) teamMap.set(teamNo, []);
    teamMap.get(teamNo)!.push({
      playerId: -Number(r.id),
      name: String(r.name),
      position: String(r.position),
      isGuest: true,
      hostName: String(r.host_name),
    });
  }

  const teams: MatchTeam[] = [...teamMap.keys()]
    .sort((a, b) => a - b)
    .map((teamNo) => ({ teamNo, name: teamNames[teamNo], players: teamMap.get(teamNo)! }));

  const statRows = (await sqlClient.query(
    `
    SELECT p.name, s.goals, s.assists
    FROM stats s
    JOIN players p ON p.id = s.player_id
    WHERE s.match_id = $1
    ORDER BY p.name ASC
    `,
    [mid],
  )) as Array<{ name: string; goals: number; assists: number }>;

  const stats: MatchStatRow[] = statRows.map((r) => ({
    name: String(r.name),
    goals: Number(r.goals),
    assists: Number(r.assists),
  }));

  return {
    id: Number(meta.id),
    playedOn: String(meta.played_on),
    matchTime: String(meta.match_time),
    numTeams: Number(meta.num_teams),
    teamSize: Number(meta.team_size),
    status: normStatus(meta.status),
    matchdayStatus: normMatchday(meta.matchday_status),
    statsScoringEnabled: Number(meta.stats_scoring_enabled) === 1,
    locationName: String(meta.location_name ?? ""),
    locationLat: meta.location_lat == null ? null : Number(meta.location_lat),
    locationLng: meta.location_lng == null ? null : Number(meta.location_lng),
    venue: meta.venue === "indoor" || meta.venue === "outdoor" ? meta.venue : null,
    teams,
    stats,
  };
}
