import type { ChemistryReport } from "@/lib/chemistry";

/**
 * Chemistry & head-to-head — playful social stats, framed as fun, never a
 * verdict. Only pairings with enough shared matches are shown.
 */
export default function ChemistryPanel({ report }: { report: ChemistryReport }) {
  const hasAny = report.partners.length > 0 || report.rivals.length > 0;
  if (!hasAny) {
    return (
      <p className="text-sm text-neutral-500">
        Play at least {report.minShared} matches with the same teammates to unlock chemistry stats.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {report.bestPartner ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          🤝 You win {Math.round(report.bestPartner.winRate * 100)}% of matches on{" "}
          {report.bestPartner.name}&apos;s team
        </p>
      ) : null}

      {report.partners.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Best partnerships</h3>
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {report.partners.slice(0, 5).map((p) => (
              <li key={p.playerId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-neutral-400">
                  {Math.round(p.winRate * 100)}% win · {p.shared} together
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.rivals.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Head-to-head</h3>
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {report.rivals.slice(0, 5).map((o) => (
              <li key={o.playerId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium">vs {o.name}</span>
                <span className="text-xs text-neutral-400">
                  {o.wins}–{o.losses} in {o.faced} meetings
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
