"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveAutomation, generateNextAutomatedMatch, processMatchAutomation, setOccurrenceException, getAutomation } from "@/lib/match-automation";
import { sqlClient } from "@/lib/db";
import { logAppError } from "@/lib/error-log";

export type AutomationActionState = { ok: boolean; message: string };

export async function automationAction(_prev: AutomationActionState, data: FormData): Promise<AutomationActionState> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin" && session?.user?.role !== "super") throw new Error("Only admins can configure automation.");
    const seasonId = z.coerce.number().int().positive().parse(data.get("seasonId"));
    const intent = z.enum(["save", "retry", "skip", "restore", "apply"]).parse(data.get("intent"));
    const actor = session.user.name ?? "admin";
    if (intent === "save") {
      await saveAutomation(seasonId, {
        weekday: Number(data.get("weekday")), kickoffTime: String(data.get("kickoffTime")),
        openingWeekday: Number(data.get("openingWeekday")), openingTime: String(data.get("openingTime")),
        baseMinutes: Number(data.get("baseMinutes")), extensionMinutes: Number(data.get("extensionMinutes")),
        maxPlayers: Number(data.get("maxPlayers")), extensionThreshold: Number(data.get("extensionThreshold")),
        numTeams: Number(data.get("numTeams")), statsScoringEnabled: data.get("statsScoringEnabled") === "on",
        locationName: String(data.get("locationName")), venue: z.enum(["indoor", "outdoor"]).parse(data.get("venue")),
        locationLat: data.get("locationLat") ? Number(data.get("locationLat")) : null,
        locationLng: data.get("locationLng") ? Number(data.get("locationLng")) : null,
        enabled: data.get("enabled") === "on", paused: data.get("paused") === "on",
      }, actor);
    } else if (intent === "skip") {
      const cost = z.enum(["keep", "waive"]).parse(data.get("cost"));
      await setOccurrenceException(seasonId, String(data.get("date")), cost === "waive", actor);
    } else if (intent === "restore" || intent === "apply") {
      const matchId = z.coerce.number().int().positive().parse(data.get("matchId"));
      const [, rows] = await sqlClient.transaction([
        sqlClient.query(`SELECT id FROM matches WHERE id=$1 FOR UPDATE`, [matchId]),
        sqlClient.query(
          intent === "restore"
            ? `UPDATE matches m SET availability_override=NULL
               FROM season_match_occurrences o WHERE o.match_id=m.id AND o.season_id=$1 AND m.id=$2 AND o.state='scheduled' RETURNING m.id`
            : `UPDATE matches m SET base_minutes=a.base_minutes,extension_minutes=a.extension_minutes,
                extension_threshold=a.extension_threshold,
                max_players=a.max_players,num_teams=a.num_teams,stats_scoring_enabled=a.stats_scoring_enabled::int,
                location_name=a.location_name,location_lat=a.location_lat,location_lng=a.location_lng,venue=a.venue
               FROM season_match_occurrences o JOIN season_match_automation a ON a.season_id=o.season_id
               WHERE o.match_id=m.id AND o.season_id=$1 AND m.id=$2 AND o.state='scheduled'
                 AND m.matchday_status='draft' AND m.kickoff_at>now()+interval '24 hours'
               RETURNING m.id`,
          [seasonId, matchId],
        ),
      ]);
      if (!rows.length) throw new Error("Only an eligible match in this automation can be updated.");
      await sqlClient.query(`INSERT INTO match_automation_audit(season_id,match_id,event,actor) VALUES($1,$2,$3,$4)`,
        [seasonId, matchId, intent === "restore" ? "Scheduled opening restored" : "Current match template updated (kickoff/opening unchanged)", actor]);
    } else {
      const config = await getAutomation(seasonId);
      if (!config.enabled || config.paused) throw new Error("Enable and resume automation before retrying.");
      await sqlClient.query(`UPDATE season_match_automation SET needs_generation=true WHERE season_id=$1`, [seasonId]);
    }
    const link = data.get("linkMatchId");
    const matchId = await generateNextAutomatedMatch(seasonId, link ? z.coerce.number().int().positive().parse(link) : null);
    const processed = await processMatchAutomation();
    revalidatePath("/season");
    revalidatePath("/matches");
    revalidatePath("/", "layout");
    return { ok: true, message: (matchId ? `Saved. Next match #${matchId} is ready.` : "Saved. Existing match responses and invoice amounts were not changed.")
      + (processed.failed ? " Notification or recovery errors need attention; see the calendar and diagnostics." : "") };
  } catch (error) {
    await logAppError(error, "season.automation-action");
    revalidatePath("/season");
    revalidatePath("/matches");
    return { ok: false, message: error instanceof Error ? error.message : "Could not update automation." };
  }
}
