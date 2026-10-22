import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { purgeExpiredStories } from "@/lib/stories";
import { sqlClient } from "@/lib/db";
import { notify, getNotificationTypeStatuses } from "@/lib/push";
import { isAvailabilityLockEnabled, getSetting, setSetting } from "@/lib/feature-settings";
import { matchLabel } from "@/lib/format";
import { kickoffAtSql } from "@/lib/kickoff-sql";
import { AVAILABILITY_LOCK_MS, formatDuration, kickoffMs } from "@/lib/match-schedule";
import { getWaitlist } from "@/lib/availability";
import { isAvailabilityLockPushDue } from "@/lib/reminder-scheduling";
import { sendSeasonPaymentReminders } from "@/lib/season-reminders";
import { logAppError } from "@/lib/error-log";

/**
 * Scheduled nudges. Everything else in the app fires because an admin pressed a
 * button, so players who simply forget are never chased.
 *
 * Runs once a day (Vercel Hobby allows no more; see vercel.json). Each reminder
 * is sent at most once per match, recorded in app_settings, so re-runs and
 * retries are harmless.
 */

export const dynamic = "force-dynamic";

/**
 * Nudge non-responders this long before changes close. Must exceed 24h: with a
 * single daily run, a narrower window could fall between two runs and never
 * match. The once-per-match flag keeps the wide window from repeating.
 */
const NUDGE_BEFORE_LOCK_MS = 36 * 60 * 60 * 1000;

type UpcomingMatch = {
  id: number;
  played_on: string;
  kickoff_at: string | Date | null;
  availability_open: number;
  num_teams: number;
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
  const locked: string[] = [];

  const matches = (await sqlClient.query(
    `SELECT id, played_on, COALESCE(num_teams, 0) AS num_teams, ${kickoffAtSql()} AS kickoff_at,
            COALESCE(availability_open, 1) AS availability_open
       FROM matches
      WHERE played_on IS NOT NULL
        AND ${kickoffAtSql()} > NOW()
        AND ${kickoffAtSql()} < NOW() + INTERVAL '7 days'
        AND COALESCE(matchday_status, 'draft') <> 'closed'
      ORDER BY kickoff_at ASC`,
  )) as UpcomingMatch[];

  const lockEnabled = await isAvailabilityLockEnabled();
  // Lock pushes are off unless an admin re-enables the "Availability locked"
  // notification type; while off, nothing is claimed so re-enabling still works.
  const lockPushEnabled =
    lockEnabled &&
    (await getNotificationTypeStatuses()).some(
      (t) => t.key === "availability_locked" && t.enabled,
    );

  // Hobby runs once daily: lock pushes arrive at the first run after the
  // deadline (up to roughly 24 hours late), provided kickoff is still ahead.
  for (const match of matches) {
    const matchId = Number(match.id);
    const kickoff = kickoffMs(match.kickoff_at);
    if (kickoff == null) continue;

    const msToLock = kickoff - AVAILABILITY_LOCK_MS - now;

    if (
      lockPushEnabled &&
      isAvailabilityLockPushDue(match.kickoff_at, now)
    ) {
      const lockKey = `reminder_sent_lock_${matchId}`;
      // Claim before push so an unavailable push service cannot cause a storm.
      const claimed = await sqlClient.query(
        `INSERT INTO app_settings(key, value) VALUES ($1, '1')
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [lockKey],
      );
      if (claimed.length === 0) continue;
      try {
        const [inRows, guestRows, waitlistIds] = await Promise.all([
          sqlClient.query(
            `SELECT p.id
               FROM players p
               JOIN match_availability ma ON ma.player_id = p.id
              WHERE ma.match_id = $1 AND ma.status = 'in' AND p.active = 1`,
            [matchId],
          ),
          sqlClient.query(
            `SELECT COUNT(*)::int AS n
               FROM match_guests
              WHERE match_id = $1 AND status = 'approved'`,
            [matchId],
          ),
          getWaitlist(matchId),
        ]);
        const playerIds = (inRows as Array<{ id: number }>).map((r) => Number(r.id));
        const guestCount = Number((guestRows as Array<{ n: number }>)[0]?.n ?? 0);
        const confirmedCount = playerIds.length + guestCount;
        const countLabel = `${confirmedCount} player${confirmedCount === 1 ? "" : "s"}, ${match.num_teams} teams`;
        let waitlistedCount = 0;

        if (playerIds.length > 0) {
          try {
            await notify(
              "availability_locked",
              {
                title: "Final list is in ⚽",
                body: `${matchLabel(match.played_on)} — ${countLabel}. See the confirmed list.`,
                url: `/matches/${matchId}/availability`,
                tag: `match-${matchId}-availability-locked`,
              },
              { playerIds },
            );
          } catch (error) {
            await logAppError(error, "cron.reminders.lock-roster");
          }
        }

        if (waitlistIds.length > 0) {
          const activeRows = (await sqlClient.query(
            `SELECT id FROM players WHERE active = 1 AND id = ANY($1::int[])`,
            [waitlistIds],
          )) as Array<{ id: number }>;
          const activeIds = new Set(activeRows.map((r) => Number(r.id)));
          const activeWaitlist = waitlistIds.filter(
            (id) => activeIds.has(id) && !playerIds.includes(id),
          );
          waitlistedCount = activeWaitlist.length;
          await Promise.all(
            activeWaitlist.map(async (playerId) => {
              const position = activeWaitlist.indexOf(playerId) + 1;
              try {
                await notify(
                  "availability_locked",
                  {
                    title: "You're on the waitlist",
                    body: `${matchLabel(match.played_on)} — your waitlist position is #${position}.`,
                    url: `/matches/${matchId}/availability`,
                    tag: `match-${matchId}-waitlist-${playerId}`,
                  },
                  { playerIds: [playerId] },
                );
              } catch (error) {
                await logAppError(error, "cron.reminders.lock-waitlist");
              }
            }),
          );
        }
        locked.push(`match ${matchId}: ${confirmedCount} confirmed, ${waitlistedCount} waitlisted`);
      } catch (error) {
        // Keep the cron healthy; the claim prevents duplicate pushes on retries.
        await logAppError(error, "cron.reminders.availability-lock");
      }
    }

    if (Number(match.availability_open) !== 1) continue;

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

  // Expired 24h stories: queries already hide them; this frees the rows and files.
  let storiesPurged = 0;
  try {
    const urls = await purgeExpiredStories();
    storiesPurged = urls.length;
    if (urls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) await del(urls).catch(() => {});
  } catch {
    // Never fail the reminders run because of cleanup.
  }

  let seasonReminders = { checked: 0, notified: 0, failed: 0 };
  try {
    seasonReminders = await sendSeasonPaymentReminders(new Date(now));
  } catch (error) {
    seasonReminders.failed = 1;
    await logAppError(error, "cron.reminders.season-payments");
  }

  return NextResponse.json({
    ok: true,
    checked: matches.length,
    sent,
    locked,
    seasonReminders,
    storiesPurged,
  });
}
