import type { MomentKind } from "./moment-copy";

export type MatchdayBummerFacts = {
  funMessages: boolean;
  celebrated: boolean;
  onCooldown: boolean;
  rounds: number;
  wins: number;
  losses: number;
  goals: number;
  assists: number;
  ownGoals: number;
  positionPlayed: string;
  statsRecorded: boolean;
  appearances: number;
  lastThreeGoals: number;
  ratingDelta?: number;
};

export function matchdayBummer(facts: MatchdayBummerFacts): Extract<MomentKind, `bummer_${string}`> | null {
  if (!facts.funMessages || facts.celebrated || facts.onCooldown) return null;
  if (facts.rounds >= 2 && facts.wins === 0 && facts.losses >= 2) return "bummer_winless";
  if (facts.ownGoals > 0) return "bummer_own_goal";
  if (facts.ratingDelta != null && facts.ratingDelta <= -0.5) return "bummer_rating_drop";
  if (
    facts.statsRecorded &&
    facts.rounds > 0 &&
    (facts.positionPlayed === "MID" || facts.positionPlayed === "FWD") &&
    facts.goals === 0 &&
    facts.assists === 0
  ) return "bummer_no_contribution";
  if (facts.rounds >= 2 && facts.losses > facts.wins) return "bummer_losing_record";
  if (
    facts.positionPlayed === "FWD" &&
    facts.appearances >= 3 &&
    facts.lastThreeGoals === 0
  ) return "bummer_scoreless";
  return null;
}
