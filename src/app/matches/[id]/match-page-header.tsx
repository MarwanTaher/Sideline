import Link from "next/link";
import { PhaseStrip } from "@/components/phase-strip";
import type { MatchPhase } from "@/lib/match-phase";

export function MatchPageHeader({
  matchId,
  dateLabel,
  title,
  subtitle,
  phase,
  overview = false,
}: {
  matchId: number;
  dateLabel: string;
  title: string;
  subtitle?: string;
  phase: MatchPhase;
  overview?: boolean;
}) {
  return (
    <header className="mb-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <Link
        href={overview ? "/matches" : `/matches/${matchId}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-neutral-600 transition hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
      >
        <span aria-hidden="true">←</span>
        {overview ? "All matches" : dateLabel}
      </Link>
      <div className="mt-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
          {overview ? subtitle : dateLabel}
          {!overview && subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
      <PhaseStrip phase={phase} className="mt-3" />
    </header>
  );
}
