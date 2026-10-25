import "server-only";
import { sqlClient } from "./db";

/**
 * Minimal iCalendar (.ics) generation so players can add the next match to
 * their phone calendar. This complements push — a calendar event won't tell you
 * "teams are posted" — but it's a low-effort convenience worth having.
 */

type IcsMatch = {
  id: number;
  playedOn: string;
  matchTime: string;
};

/** Parse a "hh:mm am/pm" (or "HH:MM") label into { h, m } 24-hour, or null. */
function parseTime(label: string): { h: number; m: number } | null {
  const txt = label.trim().toLowerCase();
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/.exec(txt);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3];
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build a floating-time DTSTART/DTEND (90-minute event) for a match. */
function eventTimes(match: IcsMatch): { start: string; end: string } | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(match.playedOn);
  if (!dm) return null;
  const [, y, mo, d] = dm;
  const t = parseTime(match.matchTime) ?? { h: 21, m: 0 };
  const startDate = new Date(Number(y), Number(mo) - 1, Number(d), t.h, t.m);
  const endDate = new Date(startDate.getTime() + 90 * 60 * 1000);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  return { start: fmt(startDate), end: fmt(endDate) };
}

function fold(line: string): string {
  return line.replace(/([,;])/g, "\\$1");
}

export async function buildMatchIcs(matchId: number, baseUrl: string): Promise<string | null> {
  const rows = (await sqlClient.query(
    `SELECT id, played_on, COALESCE(match_time, '') AS match_time FROM matches WHERE id = $1`,
    [matchId],
  )) as Array<{ id: number; played_on: string; match_time: string }>;
  if (rows.length === 0) return null;
  const match: IcsMatch = {
    id: Number(rows[0].id),
    playedOn: String(rows[0].played_on),
    matchTime: String(rows[0].match_time),
  };
  const times = eventTimes(match);
  if (!times) return null;

  const now = new Date();
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const url = baseUrl ? `${baseUrl}/matches/${match.id}` : "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sideline//Match//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:sideline-match-${match.id}@sideline`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${times.start}`,
    `DTEND:${times.end}`,
    fold(`SUMMARY:Football \u2014 Match ${match.id}`),
    fold(`DESCRIPTION:Sideline match ${match.id}. Set your availability and check teams.`),
    ...(url ? [fold(`URL:${url}`)] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Match in 2 hours",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
