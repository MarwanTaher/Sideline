"use client";

import { useEffect, useState } from "react";

/** Labeled horizontal bar: [label 60px] [flex fill 7px] [value 28px]. Animates on mount. */
export function StatBar({
  label,
  value,
  max,
  display,
  colorClass = "bg-emerald-500",
}: {
  label: string;
  value: number;
  max: number;
  /** Optional formatted value (defaults to the raw number). */
  display?: string;
  colorClass?: string;
}) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    const raf = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(raf);
  }, [value, max]);

  return (
    <div className="flex items-center gap-3">
      <span className="w-[60px] shrink-0 text-xs font-medium text-neutral-500">{label}</span>
      <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${colorClass}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className="w-7 shrink-0 text-right font-heading text-sm font-bold tabular-nums">
        {display ?? value}
      </span>
    </div>
  );
}
