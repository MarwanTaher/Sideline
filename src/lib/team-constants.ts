// Client-safe team-count constants (no DB imports).

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 5;

/** Selectable team counts, e.g. [2, 3, 4, 5]. */
export const TEAM_COUNT_OPTIONS: number[] = Array.from(
  { length: MAX_TEAMS - MIN_TEAMS + 1 },
  (_, i) => MIN_TEAMS + i,
);

/** Responsive grid column classes that scale with how many teams there are. */
export function teamGridColumns(count: number): string {
  if (count >= 4) return "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  if (count === 3) return "sm:grid-cols-2 lg:grid-cols-3";
  return "sm:grid-cols-2";
}
