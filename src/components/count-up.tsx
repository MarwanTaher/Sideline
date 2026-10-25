"use client";

import { useEffect, useState } from "react";

/**
 * Counts from `from` to `to` once on mount (ease-out). Renders the final value
 * immediately under reduced motion or on the server.
 */
export function CountUp({ to, from, durationMs = 900 }: { to: number; from?: number; durationMs?: number }) {
  const start = from ?? to;
  const [value, setValue] = useState(start);

  useEffect(() => {
    if (start === to) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(start + (to - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, durationMs]);

  return <>{value}</>;
}
