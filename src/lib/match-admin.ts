import { sqlClient } from "@/lib/db";
import { notify } from "@/lib/push";
import { deleteGuestsForMatch } from "@/lib/guests";
import { syncAchievements } from "@/lib/achievements";
import { assignMatchToActiveSeason } from "@/lib/seasons";
import {
  captureScoreSnapshot,
  getRatingChangesForMatch,
  snapshotKeyForMatch,
} from "@/lib/score-snapshots";
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
  maxPlayers: number;
  availabilityOpen: boolean;
}

/** Default cap on how many players can mark themselves IN for a match. */
export const DEFAULT_MAX_PLAYERS = 18;

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
  max_players: number | null;
  availability_open: number | null;
}

export async function getMatchAdmin(matchId: number): Promise<MatchAdmin | null> {
  const raw = await sqlClient.query(
    `SELECT id, played_on, match_time, num_teams, team_size,
            stats_scoring_enabled, status, matchday_status,
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
  const matchId = Number(rows[0].id);

  // Tag the match with the active season (if one exists) so season stats and
  // the archive stay accurate. Never let this block match creation.
  try {
    await assignMatchToActiveSeason(matchId);
  } catch {
    // ignore — seasons are optional
  }

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
  await sqlClient.query(`UPDATE matches SET matchday_status = $1 WHERE id = $2`, [
    status,
    matchId,
  ]);

  if (status === "closed") {
    // Guests are temporary — remove them when the matchday is closed.
    await deleteGuestsForMatch(matchId);
    // Snapshot the leaderboard and pull people back with "results are in" +
    // personalised rating-change nudges. Never let push/snapshot failures
    // block the status change.
    try {
      await sendMatchdayCloseNotifications(matchId);
    } catch {
      // ignore snapshot/push errors
    }
  }

  if (status === "active") {
    // Notify subscribers that the match is live. Never let a push failure
    // block the status change.
    try {
      await notify("match_activated", {
        title: "Match is live \u26bd",
        body: `Match ${matchId} is now active \u2014 set your availability and get ready.`,
        url: `/matches/${matchId}/availability`,
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
  await captureScoreSnapshot(snapshotKeyForMatch(matchId));

  // "Results are in" — one broadcast per close, gated by the per-type toggle.
  await notify("results_in", {
    title: "Results are in \u26bd",
    body: "Ratings are updated for the latest match \u2014 see how you did.",
    url: "/leaderboard",
    tag: `match-${matchId}-results`,
  });

  // Personalised rating-change nudges (only meaningful moves, ranked players).
  const changes = await getRatingChangesForMatch(matchId, { minAbsDelta: 1 });
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