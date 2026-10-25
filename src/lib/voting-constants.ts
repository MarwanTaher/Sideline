// Client-safe voting rating constants (no DB imports).

export const MIN_RATING = 0;
export const MAX_RATING = 10;
export const DEFAULT_RATING = 5;

// Human-readable descriptor for each rating value, so every voter interprets
// the 0–10 scale the same way.
export const RATING_LABELS: Record<number, string> = {
  0: "Didn't turn up",
  1: "Very poor",
  2: "Poor",
  3: "Below average",
  4: "Fair",
  5: "Average",
  6: "Decent",
  7: "Good",
  8: "Very good",
  9: "Excellent",
  10: "World class",
};

export function ratingLabel(rating: number): string {
  const r = Math.round(rating);
  return RATING_LABELS[r] ?? "";
}

// Broad tiers used for colour cues and the compact legend.
export type RatingTier = "low" | "mid" | "high" | "elite";

export function ratingTier(rating: number): RatingTier {
  const r = Math.round(rating);
  if (r <= 3) return "low";
  if (r <= 5) return "mid";
  if (r <= 8) return "high";
  return "elite";
}

