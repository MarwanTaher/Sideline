// Client-safe: the player-facing stage of a match in its weekly cycle.
//
// Internal matchday statuses (draft / active / closed) describe admin workflow;
// players need to know what they can do *now*. This maps the stored state onto
// five ordered steps used by the phase strip, Home and match pages.

import { isWithinAvailabilityLock, type KickoffInput } from "./match-schedule";

export type MatchPhase = "open" | "locked" | "teams" | "matchday" | "done";

export const MATCH_PHASES: readonly MatchPhase[] = [
  "open",
  "locked",
  "teams",
  "matchday",
  "done",
] as const;

export const PHASE_LABEL: Record<MatchPhase, string> = {
  open: "Sign-up",
  locked: "Locked",
  teams: "Teams",
  matchday: "Matchday",
  done: "Done",
};

export const PHASE_HINT: Record<MatchPhase, string> = {
  open: "Sign-up is open. Mark yourself in or out.",
  locked: "The list is locked. Only admins can change it now.",
  teams: "Teams are drafted. Check which side you're on.",
  matchday: "Game on. Rate your teammates when you're done.",
  done: "Results are final.",
};

export interface MatchPhaseInput {
  matchdayStatus: "draft" | "active" | "closed";
  availabilityOpen: boolean;
  kickoffAt: KickoffInput;
  /** Whether the 24h lock feature is switched on club-wide. */
  lockEnabled: boolean;
  /** True once at least one player is on a team sheet. */
  hasRoster: boolean;
}

export function getMatchPhase(m: MatchPhaseInput, nowMs: number = Date.now()): MatchPhase {
  if (m.matchdayStatus === "closed") return "done";
  if (m.matchdayStatus === "active") return "matchday";
  if (m.hasRoster) return "teams";
  if (!m.availabilityOpen) return "locked";
  if (m.lockEnabled && isWithinAvailabilityLock(m.kickoffAt, nowMs)) return "locked";
  return "open";
}

export function phaseIndex(phase: MatchPhase): number {
  return MATCH_PHASES.indexOf(phase);
}

export interface PhaseAction {
  href: string;
  label: string;
  /** Path suffix of the match tab this action points at ("" = overview). */
  tab: "" | "availability" | "draft" | "matchday" | "vote" | "stats";
}

/**
 * The single most useful next step for this viewer in this phase, so a match
 * page always answers "what do I do now?".
 */
export function phaseAction(
  phase: MatchPhase,
  matchId: number,
  v: {
    isAdmin: boolean;
    canScore: boolean;
    onRoster: boolean;
    myStatus?: "in" | "out" | "pending";
  },
): PhaseAction | null {
  const to = (tab: PhaseAction["tab"], label: string): PhaseAction => ({
    href: tab ? `/matches/${matchId}/${tab}` : `/matches/${matchId}`,
    label,
    tab,
  });
  switch (phase) {
    case "open":
      if (v.myStatus === "pending") return to("availability", "Reply IN or OUT");
      return to("availability", v.isAdmin ? "Manage sign-up" : "See who's playing");
    case "locked":
      return v.isAdmin ? to("draft", "Pick the teams") : to("availability", "See who's playing");
    case "teams":
      if (v.canScore) return to("matchday", "Start matchday");
      return v.isAdmin ? to("draft", "Review teams") : null;
    case "matchday":
      return v.canScore ? to("matchday", "Open matchday") : to("stats", "Follow the score");
    case "done":
      return v.onRoster ? to("vote", "Rate your teammates") : to("stats", "See the stats");
  }
}
