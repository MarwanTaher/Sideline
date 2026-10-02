// Kickoff as a real instant, derived in SQL.
//
// `kickoff_at` is the source of truth, but rows written before that column
// existed — or by any path that forgets it — would be NULL. The 24h lock treats
// a missing instant as "no deadline", so a NULL silently switches the lock off.
// Falling back to the stored wall-clock columns means the lock can never be
// disabled by missing data.

export const CLUB_TIME_ZONE = "Europe/Warsaw";

/** Default kickoff when a match has no time recorded. */
const DEFAULT_TIME = "09:00 pm";

export function kickoffAtSql(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `COALESCE(
    ${p}kickoff_at,
    (to_timestamp(
       ${p}played_on || ' ' || COALESCE(NULLIF(btrim(${p}match_time), ''), '${DEFAULT_TIME}'),
       'YYYY-MM-DD HH12:MI am'
     )::timestamp AT TIME ZONE '${CLUB_TIME_ZONE}')
  )`;
}
