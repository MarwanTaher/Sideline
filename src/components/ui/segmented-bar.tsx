/** Single multi-segment proportion bar (2px gaps) with a dot legend below. */
export type Segment = {
  label: string;
  value: number;
  /** Tailwind bg class for the bar segment. */
  barClass: string;
  /** Tailwind bg class for the legend dot. */
  dotClass: string;
};

export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              className={s.barClass}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${s.dotClass}`} />
            {s.label} <span className="font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
