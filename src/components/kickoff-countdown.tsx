"use client";

import { useEffect, useState } from "react";
import { formatDuration, kickoffMs } from "@/lib/match-schedule";

/**
 * Ticks client-side so the value stays honest on a cached page — and so the
 * server render stays pure (Date.now() during render is not idempotent).
 */
export default function KickoffCountdown({ kickoffAt }: { kickoffAt: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const start = kickoffMs(kickoffAt);
    if (start == null) return;
    const tick = () => setRemaining(start - Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [kickoffAt]);

  if (remaining == null || remaining <= 0) return null;

  return (
    <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      Kicks off in {formatDuration(remaining)}
    </span>
  );
}
