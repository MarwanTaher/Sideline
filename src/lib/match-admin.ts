import { sqlClient } from "@/lib/db";
import { notify } from "@/lib/push";
import { deleteGuestsForMatch } from "@/lib/guests";
import { syncAchievements } from "@/lib/achievements";
import { generateMatchMoments } from "@/lib/moments";
import { getMatchDigest } from "@/lib/match-digest";
import { digestPushBody } from "@/lib/digest-push";
import { logAppError } from "@/lib/error-log";
import {
  captureScoreSnapshot,
  getRatingChangesForMatch,
  snapshotKeyForMatch,
} from "@/lib/score-snapshots";
export type MatchdayStatus = "draft" | "active" | "closed";
export type MatchStatus = "open" | "closed";

/**
 * Kickoff is entered as club-local wall time ("2026-09-25", "09:00 pm") but must
 * be stored as a true instant. Postgres does the conversion so the app never
 * depends on the server's clock zone (UTC on Vercel).
 */
export const CLUB_TIME_ZONE = "Europe/Warsaw";
const KICKOFF_FROM_LOCAL = `(to_timestamp($1 || ' ' || COALESCE(NULLIF(btrim($2), ''), '09:00 pm'), 'YYYY-MM-DD HH12:MI am')::timestamp AT TIME ZONE '${CLUB_TIME_ZONE}')`;

export interface MatchAdmin {
  id: number;
  playedOn: string;
  matchTime: string;
  numTeams: number;
  teamSize: number;
  statsScoringEnabled: boolean;
  status: MatchStatus;
  matchdayStatus: MatchdayStatus;
  maxPlayers: number;
  availabilityOpen: boolean;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  venue: "indoor" | "outdoor" | null;
}

/** Default cap on how many players can mark themselves IN for a match. */
export const DEFAULT_MAX_PLAYERS = 18;

export interface CreateMatchInput {
  playedOn: string; // YYYY-MM-DD
  matchTime: string; // "hh:mm am/pm"
  numTeams: number; // 2 | 3
  statsScoringEnabled: boolean;
  /** Season this match belongs to; null means an ordinary one-off match. */
  seasonId?: number | null;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  venue?: "indoor" | "outdoor" | null;
}

export interface UpdateMatchInput {
  playedOn: string;
  matchTime: string;
  numTeams: number;
  statsScoringEnabled: boolean;
  seasonId?: number | null;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  venue?: "indoor" | "outdoor" | null;
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
  max_players: number | null;
  availability_open: number | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  venue: string | null;
}

export async function getMatchAdmin(matchId: number): Promise<MatchAdmin | null> {
  const raw = await sqlClient.query(
    `SELECT id, played_on, match_time, num_teams, team_size,
            stats_scoring_enabled, status, matchday_status,
            location_name, location_lat, location_lng, venue,
            COALESCE(max_players, ${DEFAULT_MAX_PLAYERS}) AS max_players,
            COALESCE(availability_open, 1) AS availability_open
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
    maxPlayers: Number(m.max_players ?? DEFAULT_MAX_PLAYERS),
    availabilityOpen: Number(m.availability_open ?? 1) === 1,
    locationName: m.location_name ?? "",
    locationLat: m.location_lat == null ? null : Number(m.location_lat),
    locationLng: m.location_lng == null ? null : Number(m.location_lng),
    venue: m.venue === "indoor" || m.venue === "outdoor" ? m.venue : null,
  };
}

/**
 * Create a new match. Mirrors the Streamlit create flow: team_size starts at 0
 * (set later by the draft), status 'open', matchday_status 'draft' (default).
 * Returns the new match id.
 */
export async function createMatch(input: CreateMatchInput): Promise<number> {
  const [rows] = (await sqlClient.transaction([
    sqlClient.query(
      `WITH created AS (
         INSERT INTO matches
           (played_on, match_time, kickoff_at, num_teams, team_size, total_payment,
            stats_scoring_enabled, status, location_name, location_lat, location_lng,
            venue, season_id, payment_currency)
         VALUES ($1, $2, ${KICKOFF_FROM_LOCAL}, $3, 0, 0, $4, 'open',
                 $5, $6, $7, $8, $9,
                 COALESCE((SELECT payment_currency FROM matches ORDER BY id DESC LIMIT 1), 'PLN'))
         RETURNING id
       ),
       auto_in AS (
         INSERT INTO match_availability (match_id, player_id, status, updated_at)
         SELECT created.id, ss.player_id, 'in', CURRENT_TIMESTAMP
           FROM created
           JOIN season_subscriptions ss ON ss.season_id = $9 AND ss.status = 'active'
           JOIN seasons s ON s.id = ss.season_id AND s.subscription_enabled = true
          WHERE $9::int IS NOT NULL
         ON CONFLICT (match_id, player_id) DO NOTHING
         RETURNING player_id
       )
       SELECT id FROM created`,
      [
        input.playedOn,
        normalizeMatchTime(input.matchTime),
        input.numTeams,
        input.statsScoringEnabled ? 1 : 0,
        input.locationName?.trim() || null,
        input.locationLat ?? null,
        input.locationLng ?? null,
        input.venue ?? null,
        input.seasonId ?? null,
      ],
    ),
  ]));
  const matchId = Number(rows[0].id);

  // Ask everyone to mark their availability for the new match. Never let a
  // push failure block match creation.
  try {
    await notify("match_created", {
      title: "New match \u26bd",
      body: `New match on ${input.playedOn} at ${normalizeMatchTime(input.matchTime)} \u2014 mark yourself in or out.`,
      url: `/matches/${matchId}/availability`,
      tag: `match-${matchId}-created`,
    });
  } catch {
    // ignore push errors
  }

  return matchId;
}

export async function getMatchSeasonId(matchId: number): Promise<number | null> {
  const rows = (await sqlClient.query(
    `SELECT season_id FROM matches WHERE id = $1`,
    [matchId],
  )) as Array<{ season_id: number | null }>;
  const value = rows[0]?.season_id;
  return value == null ? null : Number(value);
}

export async function updateMatchSettings(
  matchId: number,
  input: UpdateMatchInput,
): Promise<void> {
  await sqlClient.query(
    `UPDATE matches
        SET played_on = $1,
            match_time = $2,
            kickoff_at = ${KICKOFF_FROM_LOCAL},
            num_teams = $3,
            stats_scoring_enabled = $4,
            location_name = $6,
            location_lat = $7,
            location_lng = $8,
            venue = $9,
            season_id = $10
      WHERE id = $5`,
    [
      input.playedOn,
      normalizeMatchTime(input.matchTime),
      input.numTeams,
      input.statsScoringEnabled ? 1 : 0,
      matchId,
      input.locationName?.trim() || null,
      input.locationLat ?? null,
      input.locationLng ?? null,
      input.venue ?? null,
      input.seasonId ?? null,
    ],
  );
}

/**
 * Open or close availability responses for a match. This is a manual admin
 * switch that is independent of the matchday lifecycle (draft/active/closed).
 */
export async function setAvailabilityOpen(
  matchId: number,
  open: boolean,
): Promise<void> {
  await sqlClient.query(
    `UPDATE matches SET availability_open = $1 WHERE id = $2`,
    [open ? 1 : 0, matchId],
  );

  if (open) {
    // Opening availability asks everyone to respond — link straight to the
    // availability page. Never let a push failure block the switch.
    try {
      const raw = await sqlClient.query(
        `SELECT played_on, match_time FROM matches WHERE id = $1`,
        [matchId],
      );
      const meta = (raw as { played_on: string | null; match_time: string | null }[])[0];
      const when = meta
        ? `${meta.played_on ?? ""}${meta.match_time ? ` at ${meta.match_time}` : ""}`.trim()
        : "";
      await notify("availability_open", {
        title: "Availability open \u26bd",
        body: when
          ? `Match on ${when} \u2014 mark yourself in or out.`
          : `Match ${matchId} \u2014 mark yourself in or out.`,
        url: `/matches/${matchId}/availability`,
        tag: `match-${matchId}-availability`,
      });
    } catch {
      // ignore push errors
    }
  }
}

/** Set the maximum number of players that can mark themselves IN. */
export async function setMaxPlayers(matchId: number, maxPlayers: number): Promise<void> {
  await sqlClient.query(`UPDATE matches SET max_players = $1 WHERE id = $2`, [
    maxPlayers,
    matchId,
  ]);
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
  const updated = await sqlClient.query(
    `UPDATE matches SET matchday_status = $1
      WHERE id = $2 AND matchday_status IS DISTINCT FROM $1
      RETURNING id`,
    [status, matchId],
  );
  if (updated.length === 0) return;

  if (status === "closed") {
    // Guests are temporary — remove them when the matchday is closed.
    await deleteGuestsForMatch(matchId);
    // Snapshot the leaderboard and pull people back with "results are in" +
    // personalised rating-change nudges. Never let push/snapshot failures
    // block the status change.
    try {
      await sendMatchdayCloseNotifications(matchId);
    } catch (err) {
      await logAppError(err, "matches.close-notifications");
    }
  }

  if (status === "active") {
    // Notify subscribers that it's matchday — the game is on today. This is not
    // an availability call (that went out when the match was created / opened);
    // by now teams are drafted, so point people at the match itself.
    try {
      await notify("match_activated", {
        title: "It's matchday \u26bd",
        body: `Match ${matchId} is live today \u2014 check your team and see you on the pitch.`,
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
  if (status === "closed") {
    await deleteGuestsForMatch(matchId);
  }
}

/** Delete a match. All match-scoped data is removed via ON DELETE CASCADE. */
export async function deleteMatch(matchId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM matches WHERE id = $1`, [matchId]);
}

/**
 * On matchday close: snapshot the leaderboard, broadcast "results are in", and
 * send each meaningfully-moved player a personalised rating-change nudge.
 * Framing is neutral/positive — we never push "you dropped N places".
 */
async function sendMatchdayCloseNotifications(matchId: number): Promise<void> {
  // Capture the leaderboard first so rating-change diffing has fresh data.
  if (
    !(await captureScoreSnapshot(snapshotKeyForMatch(matchId))) &&
    !(await captureScoreSnapshot(snapshotKeyForMatch(matchId)))
  ) {
    throw new Error("Scoring inputs changed during match close; score snapshot could not be captured.");
  }
  const digest = await getMatchDigest(matchId);

  // "Results are in" — one broadcast per close, gated by the per-type toggle.
  await notify("results_in", {
    title: "Results are in \u26bd",
    body: digestPushBody(digest),
    url: `/matches/${matchId}/recap`,
    tag: `match-${matchId}-results`,
  });

  // Personalised rating-change nudges (only meaningful moves, ranked players).
  // Moments use a finer 0.5 threshold; pushes keep the >=1.0 / rank-moved rule.
  const allChanges = await getRatingChangesForMatch(matchId, { minAbsDelta: 0.5 });
  const changes = allChanges.filter((c) => Math.abs(c.deltaFinal) >= 1 || c.deltaRank !== 0);
  await Promise.all(
    changes.map((c) => {
      const newVal = c.newFinal.toFixed(1);
      let body: string;
      if (c.deltaRank > 0) {
        const places = c.deltaRank === 1 ? "place" : "places";
        body = `Your rating is now ${newVal}. You moved up ${c.deltaRank} ${places}. \u2b06\ufe0f`;
      } else if (c.deltaFinal > 0) {
        body = `Your rating went up to ${newVal} (+${c.deltaFinal.toFixed(1)}).`;
      } else {
        // Neutral framing for flat/negative moves — no discouraging language.
        body = `Your rating updated to ${newVal}. See your latest breakdown.`;
      }
      return notify(
        "rating_changed",
        {
          title: "Your rating changed",
          body,
          url: "/leaderboard",
          tag: `match-${matchId}-rating-${c.playerId}`,
        },
        { playerIds: [c.playerId] },
      );
    }),
  );

  // Award any newly-earned achievements and celebrate the unlock. Grouped per
  // player so someone unlocking two badges gets one tidy nudge.
  const unlocked = await syncAchievements(matchId);

  // Celebration moments for the next app open. Never block the close on this.
  try {
    await generateMatchMoments(matchId, {
      changes: allChanges,
      unlocked: unlocked.map((u) => ({ playerId: u.playerId, label: `${u.def.emoji} ${u.def.label}` })),
    });
  } catch (err) {
    console.error("generateMatchMoments failed", err);
    await logAppError(err, "matches.moments");
  }

  const byPlayer = new Map<number, string[]>();
  for (const u of unlocked) {
    if (!byPlayer.has(u.playerId)) byPlayer.set(u.playerId, []);
    byPlayer.get(u.playerId)!.push(`${u.def.emoji} ${u.def.label}`);
  }
  await Promise.all(
    [...byPlayer.entries()].map(([playerId, badges]) =>
      notify(
        "achievement_unlocked",
        {
          title: badges.length === 1 ? "Achievement unlocked!" : "Achievements unlocked!",
          body: badges.join(" \u00b7 "),
          url: "/profile",
          tag: `match-${matchId}-achievements-${playerId}`,
        },
        { playerIds: [playerId] },
      ),
    ),
  );
}