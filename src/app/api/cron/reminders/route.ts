import { NextResponse } from "next/server";
import { sqlClient } from "@/lib/db";
import { notify } from "@/lib/push";
import { isAvailabilityLockEnabled, getSetting, setSetting } from "@/lib/feature-settings";
import { matchLabel } from "@/lib/format";
import { AVAILABILITY_LOCK_MS, formatDuration, kickoffMs } from "@/lib/match-schedule";

/**
 * Scheduled nudges. Everything else in the app fires because an admin pressed a
 * button, so players who simply forget are never chased.
 *
 * Runs hourly (see vercel.json). Each reminder is sent at most once per match,
 * recorded in app_settings, so re-runs and retries are harmless.
 */

export const dynamic = "force-dynamic";

/** Nudge non-responders this long before changes close. */
const NUDGE_BEFORE_LOCK_MS = 12 * 60 * 60 * 1000;

type UpcomingMatch = {
  id: number;
  played_on: string;
  kickoff_at: string | Date | null;
  availability_open: number;
};

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  // Vercel Cron sends this header; a matching secret also allows manual runs.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

  const now = Date.now();
  const sent: string[] = [];

  const matches = (await sqlClient.query(
    `SELECT id, played_on, kickoff_at, COALESCE(availability_open, 1) AS availability_open
       FROM matches
      WHERE kickoff_at IS NOT NULL
        AND kickoff_at > NOW()
        AND kickoff_at < NOW() + INTERVAL '7 days'
        AND COALESCE(matchday_status, 'draft') <> 'closed'
      ORDER BY kickoff_at ASC`,
  )) as UpcomingMatch[];

  const lockEnabled = await isAvailabilityLockEnabled();

  for (const match of matches) {
    const matchId = Number(match.id);
    if (Number(match.availability_open) !== 1) continue;

    const kickoff = kickoffMs(match.kickoff_at);
    if (kickoff == null) continue;

    const msToLock = kickoff - AVAILABILITY_LOCK_MS - now;
    // Only inside the nudge window, and only while there is still time to act.
    if (msToLock <= 0 || msToLock > NUDGE_BEFORE_LOCK_MS) continue;

    const flagKey = `reminder_sent_availability_${matchId}`;
    if ((await getSetting(flagKey)) === "1") continue;

    const pending = (await sqlClient.query(
      `SELECT p.id
         FROM players p
         LEFT JOIN match_availability ma
           ON ma.match_id = $1 AND ma.player_id = p.id
        WHERE p.deleted_at IS NULL
          AND (ma.status IS NULL OR ma.status = 'pending')`,
      [matchId],
    )) as Array<{ id: number }>;

    const playerIds = pending.map((r) => Number(r.id));
    // Mark first: a push failure must not cause a reminder storm on retry.
    await setSetting(flagKey, "1");
    if (playerIds.length === 0) continue;

    const closing = lockEnabled
      ? ` Changes close in ${formatDuration(msToLock)}.`
      : "";

    try {
      await notify(
        "availability_reminder",
        {
          title: "Are you playing? ⚽",
          body: `${matchLabel(match.played_on)} — you haven't marked yourself in or out.${closing}`,
          url: `/matches/${matchId}/availability`,
          tag: `match-${matchId}-availability-reminder`,
        },
        { playerIds },
      );
      sent.push(`match ${matchId}: ${playerIds.length} players`);
    } catch {
      // Never fail the cron run because push is unavailable.
    }
  }

  return NextResponse.json({ ok: true, checked: matches.length, sent });
}
