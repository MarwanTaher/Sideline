import type { PlayerSeason, SeriesPoint, MatchResult } from "@/lib/player-trends";

/** Inline SVG line sparkline — no chart library, tiny bundle. */
function Sparkline({ points, height = 40 }: { points: SeriesPoint[]; height?: number }) {
  if (points.length < 2) return null;
  const width = 240;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p.value - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-emerald-500" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} className="fill-emerald-500" />
    </svg>
  );
}

/** Tiny goals-per-match bar chart. */
function GoalBars({ points }: { points: SeriesPoint[] }) {
  if (points.length === 0) return null;
  const recent = points.slice(-12);
  const max = Math.max(1, ...recent.map((p) => p.value));
  return (
    <div className="flex items-end gap-1" style={{ height: 48 }}>
      {recent.map((p, i) => (
        <div
          key={`${p.matchId}-${i}`}
          className="flex-1 rounded-t bg-emerald-400/80 dark:bg-emerald-500/70"
          style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 4 : 1 }}
          title={`${p.label}: ${p.value} goal${p.value === 1 ? "" : "s"}`}
        />
      ))}
    </div>
  );
}

const RESULT_STYLES: Record<MatchResult, string> = {
  W: "bg-emerald-500 text-white",
  D: "bg-neutral-400 text-white",
  L: "bg-red-400 text-white",
};

export default function YourSeason({ season }: { season: PlayerSeason }) {
  if (season.appearances === 0) {
    return <p className="text-sm text-neutral-500">Play a match to start building your season.</p>;
  }

  return (
    <div>
      {/* Highlights lead the section. */}
      {season.highlights.length > 0 ? (
        <ul className="space-y-1.5">
          {season.highlights.map((h, i) => (
            <li
              key={i}
              className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              {h}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          { label: "Matches", value: season.appearances },
          { label: "Goals", value: season.goals },
          { label: "Assists", value: season.assists },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
            <p className="text-2xl font-bold tracking-tight">{s.value}</p>
            <p className="text-xs uppercase tracking-wide text-neutral-400">{s.label}</p>
          </div>
        ))}
      </div>

      {season.form.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Recent form</p>
          <div className="mt-1.5 flex gap-1.5">
            {season.form.map((r, i) => (
              <span
                key={i}
                className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${RESULT_STYLES[r]}`}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {season.hasEnoughData && season.ratingSeries.length >= 2 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Rating trend</p>
          <div className="mt-1 text-neutral-800 dark:text-neutral-200">
            <Sparkline points={season.ratingSeries} />
          </div>
        </div>
      ) : null}

      {season.hasEnoughData && season.goalsSeries.some((g) => g.value > 0) ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Goals per match</p>
          <div className="mt-1.5">
            <GoalBars points={season.goalsSeries} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
