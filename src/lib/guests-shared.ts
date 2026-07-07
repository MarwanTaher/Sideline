import type { Position } from "@/lib/positions";

/** Optional skill picker for a guest. Maps to the draft score used for balancing. */
export interface SkillLevel {
  key: string;
  label: string;
  score: number;
}

export const SKILL_LEVELS: SkillLevel[] = [
  { key: "weak", label: "Weak", score: 30 },
  { key: "below_avg", label: "Below average", score: 40 },
  { key: "avg", label: "Average", score: 50 },
  { key: "good", label: "Good", score: 60 },
  { key: "strong", label: "Strong", score: 70 },
];

/** Default skill when the host does not pick one. */
export const DEFAULT_SKILL_SCORE = 40;

/** Maximum guests a single host may bring to one match. */
export const MAX_GUESTS_PER_HOST = 2;

export function skillScoreFromKey(key: string | null | undefined): number {
  if (!key) return DEFAULT_SKILL_SCORE;
  return SKILL_LEVELS.find((s) => s.key === key)?.score ?? DEFAULT_SKILL_SCORE;
}

export function skillLabelFromScore(score: number): string {
  return SKILL_LEVELS.find((s) => s.score === score)?.label ?? "Below average";
}

export interface Guest {
  id: number;
  matchId: number;
  hostPlayerId: number;
  hostName: string;
  name: string;
  position: Position;
  skill: number;
  teamNo: number | null;
  paid: boolean;
  createdAt: string;
}
