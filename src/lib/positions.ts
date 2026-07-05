// Client-safe position constants. Kept in its own module (no DB imports) so
// client components can import POSITIONS without pulling in server-only code.

// Allowed on-pitch positions (matches the match_players CHECK constraint).
export const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type Position = (typeof POSITIONS)[number];
