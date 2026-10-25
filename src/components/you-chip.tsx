import { PHASE_LABEL, type MatchPhase } from "@/lib/match-phase";

const PHASE_TONE: Record<MatchPhase, string> = {
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  locked: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  teams: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  matchday: "bg-lime-200 text-lime-900 dark:bg-lime-900/50 dark:text-lime-200",
  done: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

/** Compact single-word stage label for lists and headers. */
export function PhaseBadge({ phase }: { phase: MatchPhase }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_TONE[phase]}`}>
      {phase === "matchday" ? "● Live" : PHASE_LABEL[phase]}
    </span>
  );
}

/**
 * "Where do I stand" for one match: answered status before the draft, team
 * membership after it.
 */
export function YouChip({
  phase,
  myStatus,
  onRoster,
}: {
  phase: MatchPhase;
  myStatus?: "in" | "out" | "pending";
  onRoster?: boolean;
}) {
  if (myStatus === undefined && onRoster === undefined) return null;
  let label: string;
  let cls: string;
  if (phase === "teams" || phase === "matchday" || phase === "done") {
    if (!onRoster) return null;
    label = phase === "done" ? "You played" : "You're playing";
    cls = "bg-emerald-600 text-white";
  } else if (myStatus === "in") {
    label = "You're IN";
    cls = "bg-emerald-600 text-white";
  } else if (myStatus === "out") {
    label = "You're OUT";
    cls = "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  } else {
    label = "Reply needed";
    cls = "bg-amber-400 text-amber-950";
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
