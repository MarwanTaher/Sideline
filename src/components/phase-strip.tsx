import {
  MATCH_PHASES,
  PHASE_HINT,
  PHASE_LABEL,
  phaseIndex,
  type MatchPhase,
} from "@/lib/match-phase";

/** Five-step "where are we this week" strip with a one-line explanation. */
export function PhaseStrip({
  phase,
  showHint = true,
  className = "",
}: {
  phase: MatchPhase;
  showHint?: boolean;
  className?: string;
}) {
  const current = phaseIndex(phase);
  return (
    <div className={className}>
      <ol className="flex items-center gap-1" aria-label="Match stage">
        {MATCH_PHASES.map((p, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={p} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={`h-1.5 w-full rounded-full ${
                  active
                    ? "bg-emerald-500"
                    : done
                      ? "bg-emerald-500/40"
                      : "bg-neutral-200 dark:bg-neutral-700"
                }`}
              />
              <span
                aria-current={active ? "step" : undefined}
                className={`truncate text-[10px] font-medium uppercase tracking-wide ${
                  active
                    ? "text-emerald-700 dark:text-emerald-400"
                    : done
                      ? "text-neutral-500"
                      : "text-neutral-400"
                }`}
              >
                {PHASE_LABEL[p]}
              </span>
            </li>
          );
        })}
      </ol>
      {showHint ? (
        <p className="mt-1.5 text-xs text-neutral-500">{PHASE_HINT[phase]}</p>
      ) : null}
    </div>
  );
}
