import "server-only";
import { z } from "zod";
import { sqlClient } from "./db";
import { calendarDates, occurrenceTimes } from "./match-recurrence";
import { getSubscriptionSeason, countActiveSubscribers } from "./season-subscriptions";
import { getSeasonGoLiveChecklist } from "./season-billing";
import { notify } from "./push";
import { logAppError } from "./error-log";

export const automationSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  kickoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  openingWeekday: z.coerce.number().int().min(0).max(6),
  openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  baseMinutes: z.coerce.number().int().min(30).max(300),
  extensionMinutes: z.coerce.number().int().min(0).max(120),
  maxPlayers: z.coerce.number().int().min(1).max(60),
  extensionThreshold: z.coerce.number().int().min(1).max(60),
  numTeams: z.coerce.number().int().min(2).max(5),
  statsScoringEnabled: z.boolean(),
  locationName: z.string().trim().min(1).max(200),
  locationLat: z.number().min(-90).max(90).nullable(),
  locationLng: z.number().min(-180).max(180).nullable(),
  venue: z.enum(["indoor", "outdoor"]),
  enabled: z.boolean(),
  paused: z.boolean(),
});
export type AutomationSettings = z.infer<typeof automationSchema>;
export type AutomationConfig = AutomationSettings & { needsGeneration: boolean; lastError: string | null; scheduledDates: string[] | null };
export const DEFAULT_AUTOMATION: AutomationConfig = {
  weekday: 0, kickoffTime: "21:00", openingWeekday: 5, openingTime: "15:00",
  baseMinutes: 90, extensionMinutes: 30, maxPlayers: 18, extensionThreshold: 18,
  numTeams: 3, statsScoringEnabled: true, locationName: "Fame Sport Club, Krakow",
  locationLat: null, locationLng: null,
  venue: "indoor", enabled: false, paused: false, needsGeneration: false, lastError: null,
  scheduledDates: null,
};

export type AutomationOccurrence = {
  date: string;
  matchId: number | null;
  state: "scheduled" | "cancelled" | "skipped";
  waiveCost: boolean;
  kickoffAt: string;
  opensAt: string;
  notificationError: string | null;
};

export async function getAutomation(seasonId: number): Promise<AutomationConfig> {
  const rows = await sqlClient.query(
    `SELECT weekday, kickoff_time AS "kickoffTime", opening_weekday AS "openingWeekday",
       opening_time AS "openingTime", base_minutes AS "baseMinutes", extension_minutes AS "extensionMinutes",
       max_players AS "maxPlayers", extension_threshold AS "extensionThreshold", num_teams AS "numTeams",
       stats_scoring_enabled AS "statsScoringEnabled", location_name AS "locationName",
       location_lat AS "locationLat",location_lng AS "locationLng", venue, enabled, paused,
       needs_generation AS "needsGeneration", last_error AS "lastError",scheduled_dates AS "scheduledDates"
     FROM season_match_automation WHERE season_id = $1`, [seasonId],
  );
  if (!rows.length) return { ...DEFAULT_AUTOMATION };
  return { ...automationSchema.parse(rows[0]), needsGeneration: rows[0].needsGeneration === true, lastError: rows[0].lastError == null ? null : String(rows[0].lastError),
    scheduledDates: rows[0].scheduledDates == null ? null : z.array(z.string()).parse(rows[0].scheduledDates) };
}

export async function listAutomationOccurrences(seasonId: number): Promise<AutomationOccurrence[]> {
  return await sqlClient.query(
    `SELECT local_date::text AS date, match_id AS "matchId", state, waive_cost AS "waiveCost",
       kickoff_at AS "kickoffAt", opens_at AS "opensAt", notification_error AS "notificationError"
     FROM season_match_occurrences WHERE season_id = $1 ORDER BY local_date`, [seasonId],
  ) as AutomationOccurrence[];
}

export async function getAutomationAudit(seasonId: number) {
  return await sqlClient.query(
    `SELECT event, actor, created_at::text AS "createdAt" FROM match_automation_audit
     WHERE season_id = $1 ORDER BY id DESC LIMIT 15`, [seasonId],
  ) as Array<{ event: string; actor: string; createdAt: string }>;
}

export async function saveAutomation(seasonId: number, input: AutomationSettings, actor: string) {
  const settings = automationSchema.parse(input);
  const [season, count, checklist] = await Promise.all([
    getSubscriptionSeason(seasonId), countActiveSubscribers(seasonId), getSeasonGoLiveChecklist(seasonId),
  ]);
  if (!season?.subscriptionEnabled || !season.endDate) throw new Error("Choose an existing subscription season with an end date.");
  if (settings.maxPlayers < season.subscriberCap || settings.maxPlayers < count) throw new Error("Capacity cannot be smaller than the core group.");
  if (settings.extensionThreshold > settings.maxPlayers) throw new Error("Extension threshold cannot exceed capacity.");
  if ((settings.locationLat == null) !== (settings.locationLng == null)) throw new Error("Choose both location coordinates.");
  const dates = calendarDates(season.startDate, season.endDate, settings.weekday);
  if (!dates.length) throw new Error("No matches fall within the season.");
  for (const date of dates) occurrenceTimes(date, settings);
  if (settings.enabled && (!season.visibleToPlayers || !checklist?.complete)) {
    throw new Error("Complete the existing season go-live checklist before enabling automation.");
  }
  await sqlClient.transaction([
    sqlClient.query(
      `INSERT INTO season_match_automation(season_id, weekday, kickoff_time, opening_weekday, opening_time,
        base_minutes, extension_minutes, max_players, extension_threshold, num_teams, stats_scoring_enabled,
        location_name, venue, enabled, paused, needs_generation,location_lat,location_lng,scheduled_dates,activated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$14,$16,$17,$18::jsonb,CASE WHEN $14 THEN now() ELSE NULL END)
       ON CONFLICT (season_id) DO UPDATE SET weekday=$2, kickoff_time=$3, opening_weekday=$4, opening_time=$5,
         base_minutes=$6, extension_minutes=$7, max_players=$8, extension_threshold=$9, num_teams=$10,
         stats_scoring_enabled=$11, location_name=$12, venue=$13, enabled=$14, paused=$15,
         location_lat=$16,location_lng=$17,
         scheduled_dates=(WITH cutoff AS (
           SELECT GREATEST((now() AT TIME ZONE 'Europe/Warsaw')::date,
             COALESCE((SELECT MAX(local_date) FROM season_match_occurrences WHERE season_id=$1 AND match_id IS NOT NULL),
               (now() AT TIME ZONE 'Europe/Warsaw')::date)) AS date
         ) SELECT COALESCE(jsonb_agg(day ORDER BY day),'[]'::jsonb) FROM (
           SELECT value::date AS day FROM jsonb_array_elements_text(COALESCE(season_match_automation.scheduled_dates,'[]'::jsonb)),cutoff WHERE value::date <= cutoff.date
           UNION SELECT value::date FROM jsonb_array_elements_text($18::jsonb),cutoff WHERE value::date > cutoff.date
           UNION SELECT local_date FROM season_match_occurrences WHERE season_id=$1
         ) retained),
         activated_at=CASE WHEN $14 THEN COALESCE(season_match_automation.activated_at,now()) ELSE season_match_automation.activated_at END,
         needs_generation=season_match_automation.needs_generation OR $14,
         revision=season_match_automation.revision+1, updated_at=now()`,
      [seasonId, settings.weekday, settings.kickoffTime, settings.openingWeekday, settings.openingTime,
        settings.baseMinutes, settings.extensionMinutes, settings.maxPlayers, settings.extensionThreshold,
        settings.numTeams, settings.statsScoringEnabled, settings.locationName, settings.venue, settings.enabled, settings.paused,settings.locationLat,settings.locationLng,JSON.stringify(dates)],
    ),
    sqlClient.query(`INSERT INTO match_automation_audit(season_id,event,actor) VALUES ($1,$2,$3)`,
      [seasonId, settings.enabled ? settings.paused ? "Automation paused" : "Automation settings saved" : "Automation disabled", actor]),
  ]);
}

export async function generateNextAutomatedMatch(seasonId: number, linkMatchId: number | null = null): Promise<number | null> {
  try {
    const rows = await sqlClient.query(`SELECT sideline_generate_match($1::int,$2::int) AS id`, [seasonId, linkMatchId]);
    return rows[0].id == null ? null : Number(rows[0].id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic match creation failed.";
    await sqlClient.query(`UPDATE season_match_automation SET last_error=$2 WHERE season_id=$1`, [seasonId, message.slice(0, 500)]);
    await logAppError(error, "automation.generate");
    throw error;
  }
}

export async function processMatchAutomation() {
  const pending = await sqlClient.query(
    `SELECT season_id FROM season_match_automation WHERE enabled AND NOT paused AND needs_generation`,
  ) as Array<{ season_id: number }>;
  let failed = 0;
  for (const row of pending) {
    try { await generateNextAutomatedMatch(row.season_id); }
    catch { failed++; } // The generator records the failure for admins and diagnostics.
  }
  const events = await sqlClient.query(
    `SELECT o.id, o.match_id, o.local_date::text AS date, o.opens_at::text, o.announced_at, o.opening_notified_at
     FROM season_match_occurrences o JOIN matches m ON m.id=o.match_id
     JOIN season_match_automation a ON a.season_id=o.season_id
     WHERE o.state='scheduled' AND a.enabled AND NOT a.paused
       AND (o.notification_claimed_until IS NULL OR o.notification_claimed_until < now())
       AND m.kickoff_at > now() AND m.matchday_status <> 'closed'
       AND (o.announced_at IS NULL OR
         (o.opening_notified_at IS NULL AND sideline_public_signup_open(m.id) AND m.kickoff_at > now()+interval '24 hours'))
     ORDER BY o.id LIMIT 20`,
  ) as Array<{ id: number; match_id: number; date: string; opens_at: string; announced_at: string | null; opening_notified_at: string | null }>;
  for (const event of events) {
    const claimed = await sqlClient.query(
      `UPDATE season_match_occurrences SET notification_claimed_until=now()+interval '5 minutes'
       WHERE id=$1 AND (notification_claimed_until IS NULL OR notification_claimed_until < now()) RETURNING id`, [event.id],
    );
    if (!claimed.length) continue;
    try {
      if (event.announced_at == null) {
        const opens = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.opens_at));
        await notify("match_created", { title: "Next season match", body: `${event.date}: core places are IN. Public signup is scheduled for ${opens}.`, url: `/matches/${event.match_id}/availability`, tag: `automation-${event.id}-created` }, { throwOnFailure: true });
        await sqlClient.query(`UPDATE season_match_occurrences SET announced_at=now() WHERE id=$1`, [event.id]);
      }
      if (event.opening_notified_at == null) {
        const rows = await sqlClient.query(`SELECT sideline_public_signup_open($1) AND kickoff_at > now()+interval '24 hours' AS due FROM matches WHERE id=$1`, [event.match_id]);
        if (rows[0]?.due) {
          await notify("availability_open", { title: "Season signup is open", body: `${event.date}: claim an available place or join the waitlist.`, url: `/matches/${event.match_id}/availability`, tag: `automation-${event.id}-open` }, { throwOnFailure: true });
          await sqlClient.query(`UPDATE season_match_occurrences SET opening_notified_at=now() WHERE id=$1`, [event.id]);
        }
      }
      await sqlClient.query(`UPDATE season_match_occurrences SET notification_claimed_until=NULL,notification_error=NULL WHERE id=$1`, [event.id]);
    } catch (error) {
      failed++;
      await sqlClient.query(`UPDATE season_match_occurrences SET notification_error=$2 WHERE id=$1`,
        [event.id, (error instanceof Error ? error.message : "Push delivery failed.").slice(0,500)]);
      await logAppError(error, "automation.notifications");
    }
  }
  return { checked: pending.length, failed };
}

export async function setOccurrenceException(seasonId: number, date: string, waiveCost: boolean, actor: string) {
  const exists = await sqlClient.query(`SELECT season_id FROM season_match_automation WHERE season_id=$1`, [seasonId]);
  if (!exists.length) throw new Error("Save the automation template before adding an exception.");
  const [config, season] = await Promise.all([getAutomation(seasonId), getSubscriptionSeason(seasonId)]);
  if (!season?.endDate || !(config.scheduledDates ?? calendarDates(season.startDate, season.endDate, config.weekday)).includes(date)) {
    throw new Error("Choose a scheduled date inside this season.");
  }
  const times = occurrenceTimes(date, config);
  if (Date.parse(times.kickoffAt) <= Date.now()) throw new Error("Historical matches cannot be cancelled through automation.");
  await sqlClient.transaction([
    sqlClient.query(
      `INSERT INTO season_match_occurrences(season_id,local_date,state,waive_cost,revision,kickoff_at,opens_at,base_cost_minor)
       SELECT $1,$2::date,'skipped',$3,a.revision,$4::timestamptz,$5::timestamptz,s.day_rate_minor
       FROM season_match_automation a JOIN seasons s ON s.id=a.season_id WHERE a.season_id=$1
       ON CONFLICT(season_id,local_date) DO UPDATE SET
         state=CASE WHEN season_match_occurrences.match_id IS NULL THEN 'skipped' ELSE 'cancelled' END, waive_cost=$3`,
      [seasonId, date, waiveCost, times.kickoffAt, times.opensAt],
    ),
    sqlClient.query(
      `UPDATE matches SET matchday_status='closed', availability_override='closed'
       WHERE id=(SELECT match_id FROM season_match_occurrences WHERE season_id=$1 AND local_date=$2::date)`, [seasonId, date],
    ),
    sqlClient.query(`UPDATE season_match_automation SET needs_generation=true WHERE season_id=$1`, [seasonId]),
    sqlClient.query(`INSERT INTO match_automation_audit(season_id,event,actor) VALUES ($1,$2,$3)`, [seasonId, `${date}: cancelled/skipped; ${waiveCost ? "base cost waived" : "base cost retained"}. Issued invoices require explicit review.`, actor]),
  ]);
}
