import type { PlayerSeason, SeriesPoint } from "@/lib/player-trends";

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

export default function YourSeason({ season }: { season: PlayerSeason }) {
  if (season.appearances === 0) {
    return <p className="text-sm text-neutral-500">Play a match to start building your season.</p>;
  }

  const played = season.record.wins + season.record.draws + season.record.losses;

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

      {played > 0 ? (
        <div className="mt-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-neutral-400">Mini-match record</p>
            <p className="text-sm font-semibold tabular-nums">
              {Math.round((season.record.wins / played) * 100)}% win
            </p>
          </div>
          <p className="mt-1 text-sm tabular-nums text-neutral-500">
            {season.record.wins}W · {season.record.draws}D · {season.record.losses}L
            <span className="text-neutral-400"> in {played}</span>
          </p>
          {season.form.length > 0 ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide text-neutral-400">Form</span>
              {season.form.map((r, i) => (
                <span
                  key={i}
                  title={r === "W" ? "Won" : r === "L" ? "Lost" : "Drawn"}
                  className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${
                    r === "W" ? "bg-emerald-500" : r === "L" ? "bg-red-500" : "bg-neutral-400"
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
          ) : null}
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
