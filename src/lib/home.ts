// Data for the phase-aware Home screen: the one match a player should care
// about right now, already joined with their own status and team.

import { sqlClient } from "@/lib/db";
import { kickoffAtSql } from "@/lib/kickoff-sql";
import type { AvailabilityStatus, MatchdayStatus } from "@/lib/availability";
import { DEFAULT_MAX_PLAYERS } from "@/lib/availability";

export interface HomeTeammate {
  playerId: number;
  name: string;
  photoUrl: string | null;
  position: string;
}

export interface HomeMatch {
  id: number;
  playedOn: string;
  matchTime: string;
  kickoffAt: string | null;
  matchdayStatus: MatchdayStatus;
  availabilityOpen: boolean;
  maxPlayers: number;
  locationName: string;
  venue: "indoor" | "outdoor" | null;
  /** Players IN plus approved guests — the same count the cap uses. */
  squadCount: number;
  guestCount: number;
  /** Active players who have not answered yet. */
  noReplyCount: number;
  hasRoster: boolean;
  myStatus: AvailabilityStatus;
  /** 1-based waitlist spot, or null when not queued. */
  waitlistPos: number | null;
  myTeamNo: number | null;
  myTeamName: string | null;
  teammates: HomeTeammate[];
}

interface Row {
  id: number;
  played_on: string;
  match_time: string;
  kickoff_at: string | Date | null;
  matchday_status: string;
  availability_open: number;
  max_players: number;
  location_name: string;
  venue: string | null;
  team_names: string | null;
  in_count: number;
  guest_count: number;
  no_reply_count: number;
  roster_count: number;
  my_status: string | null;
  waitlist: string | null;
  my_team_no: number | null;
}

/**
 * The match Home should feature: a live matchday first, otherwise the soonest
 * match still in sign-up/draft, otherwise the most recent closed one.
 */
export async function getHomeMatch(playerId: number | null): Promise<HomeMatch | null> {
  const pid = playerId ?? -1;
  const rows = (await sqlClient.query(
    `
    WITH pick AS (
      SELECT m.id
        FROM matches m
       ORDER BY
         CASE COALESCE(m.matchday_status, 'draft')
           WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
         CASE WHEN COALESCE(m.matchday_status, 'draft') = 'closed'
              THEN NULL ELSE ${kickoffAtSql("m")} END ASC NULLS LAST,
         ${kickoffAtSql("m")} DESC NULLS LAST,
         m.id DESC
       LIMIT 1
    )
    SELECT m.id, m.played_on,
           COALESCE(m.match_time, '') AS match_time,
           ${kickoffAtSql("m")} AS kickoff_at,
           COALESCE(m.matchday_status, 'draft') AS matchday_status,
           COALESCE(m.availability_open, 1) AS availability_open,
           COALESCE(m.max_players, ${DEFAULT_MAX_PLAYERS}) AS max_players,
           COALESCE(m.location_name, '') AS location_name,
           m.venue, m.team_names,
           (SELECT COUNT(*) FROM match_availability ma
              JOIN players p ON p.id = ma.player_id AND p.active = 1
             WHERE ma.match_id = m.id AND ma.status = 'in') AS in_count,
           (SELECT COUNT(*) FROM match_guests g
             WHERE g.match_id = m.id AND g.status = 'approved') AS guest_count,
           (SELECT COUNT(*) FROM players p
             WHERE p.active = 1 AND NOT EXISTS (
               SELECT 1 FROM match_availability ma
                WHERE ma.match_id = m.id AND ma.player_id = p.id)) AS no_reply_count,
           (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = m.id) AS roster_count,
           (SELECT ma.status FROM match_availability ma
             WHERE ma.match_id = m.id AND ma.player_id = $1) AS my_status,
           (SELECT s.value FROM app_settings s
             WHERE s.key = 'waitlist_' || m.id::text) AS waitlist,
           (SELECT mp.team_no FROM match_players mp
             WHERE mp.match_id = m.id AND mp.player_id = $1 LIMIT 1) AS my_team_no
      FROM matches m
      JOIN pick ON pick.id = m.id
    `,
    [pid],
  )) as Row[];
  if (rows.length === 0) return null;
  const r = rows[0];

  const myTeamNo = r.my_team_no == null ? null : Number(r.my_team_no);
  const teammates =
    myTeamNo == null
      ? []
      : ((await sqlClient.query(
          `SELECT p.id, p.name, p.photo_url, mp.position_played
             FROM match_players mp
             JOIN players p ON p.id = mp.player_id
            WHERE mp.match_id = $1 AND mp.team_no = $2 AND mp.player_id <> $3
            ORDER BY p.name`,
          [Number(r.id), myTeamNo, pid],
        )) as Array<{ id: number; name: string; photo_url: string | null; position_played: string | null }>).map(
          (t) => ({
            playerId: Number(t.id),
            name: String(t.name),
            photoUrl: t.photo_url ?? null,
            position: String(t.position_played ?? ""),
          }),
        );

  const waitlistIds = String(r.waitlist ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const wlIdx = playerId == null ? -1 : waitlistIds.indexOf(playerId);

  const inCount = Number(r.in_count ?? 0);
  const guestCount = Number(r.guest_count ?? 0);
  const ms = String(r.matchday_status);

  return {
    id: Number(r.id),
    playedOn: String(r.played_on ?? ""),
    matchTime: String(r.match_time ?? ""),
    kickoffAt:
      r.kickoff_at == null
        ? null
        : r.kickoff_at instanceof Date
          ? r.kickoff_at.toISOString()
          : String(r.kickoff_at),
    matchdayStatus: ms === "active" || ms === "closed" ? ms : "draft",
    availabilityOpen: Number(r.availability_open) === 1,
    maxPlayers: Number(r.max_players ?? DEFAULT_MAX_PLAYERS),
    locationName: String(r.location_name ?? ""),
    venue: r.venue === "indoor" || r.venue === "outdoor" ? r.venue : null,
    squadCount: inCount + guestCount,
    guestCount,
    noReplyCount: Number(r.no_reply_count ?? 0),
    hasRoster: Number(r.roster_count ?? 0) > 0,
    myStatus: r.my_status === "in" || r.my_status === "out" ? r.my_status : "pending",
    waitlistPos: wlIdx >= 0 ? wlIdx + 1 : null,
    myTeamNo,
    myTeamName: myTeamNo == null ? null : teamName(r.team_names, myTeamNo),
    teammates,
  };
}

function teamName(json: string | null, teamNo: number): string {
  if (json) {
    try {
      const v = (JSON.parse(json) as Record<string, unknown>)[String(teamNo)];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 40);
    } catch {
      // fall through to the default label
    }
  }
  return `Team ${teamNo}`;
}

export interface HomeAdminCounts {
  guestRequests: number;
  paymentsToConfirm: number;
  multisportPending: number;
}

/** Things waiting on an admin, in one round trip. */
export async function getHomeAdminCounts(
  matchId: number | null,
  seasonId: number | null,
): Promise<HomeAdminCounts> {
  const rows = (await sqlClient.query(
    `SELECT
       (SELECT COUNT(*) FROM match_guests WHERE match_id = $1 AND status = 'pending') AS guests,
       (SELECT COUNT(*) FROM season_invoices
         WHERE season_id = $2 AND paid_at IS NULL AND declared_paid_at IS NOT NULL) AS payments,
       (SELECT COUNT(*) FROM multisport_scans WHERE status = 'pending') AS scans`,
    [matchId ?? -1, seasonId ?? -1],
  )) as Array<{ guests: number; payments: number; scans: number }>;
  const r = rows[0];
  return {
    guestRequests: Number(r?.guests ?? 0),
    paymentsToConfirm: Number(r?.payments ?? 0),
    multisportPending: Number(r?.scans ?? 0),
  };
}

/** Player's W/D/L form over their last few closed matchdays, newest first. */
export async function getRecentForm(
  playerId: number,
  limit = 5,
): Promise<Array<{ matchId: number; result: "W" | "D" | "L" }>> {
  const rows = (await sqlClient.query(
    `
    WITH mine AS (
      SELECT m.id, m.played_on, mp.team_no
        FROM matches m
        JOIN match_players mp ON mp.match_id = m.id AND mp.player_id = $1
       WHERE m.matchday_status = 'closed'
       ORDER BY m.played_on DESC, m.id DESC
       LIMIT $2
    ),
    rounds AS (
      SELECT mine.id AS match_id, mine.played_on, mine.team_no, mr.id AS round_id,
             mr.team_a, mr.team_b,
             COALESCE(SUM(CASE WHEN rg.team_no = mr.team_a THEN 1 ELSE 0 END), 0) AS a,
             COALESCE(SUM(CASE WHEN rg.team_no = mr.team_b THEN 1 ELSE 0 END), 0) AS b
        FROM mine
        JOIN match_rounds mr ON mr.match_id = mine.id AND mr.status = 'done'
             AND (mr.team_a = mine.team_no OR mr.team_b = mine.team_no)
        LEFT JOIN round_goals rg ON rg.round_id = mr.id
       GROUP BY mine.id, mine.played_on, mine.team_no, mr.id, mr.team_a, mr.team_b
    )
    SELECT match_id, played_on,
           SUM(CASE WHEN (team_no = team_a AND a > b) OR (team_no = team_b AND b > a) THEN 1 ELSE 0 END) AS w,
           SUM(CASE WHEN (team_no = team_a AND a < b) OR (team_no = team_b AND b < a) THEN 1 ELSE 0 END) AS l
      FROM rounds
     GROUP BY match_id, played_on
     ORDER BY played_on DESC, match_id DESC
    `,
    [playerId, limit],
  )) as Array<{ match_id: number; w: number; l: number }>;
  return rows.map((r) => {
    const w = Number(r.w);
    const l = Number(r.l);
    return { matchId: Number(r.match_id), result: w > l ? "W" : w < l ? "L" : "D" };
  });
}
