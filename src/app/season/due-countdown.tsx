"use client";

import { useEffect, useState } from "react";

/**
 * Ticks client-side: the deadline matters to the minute, and a server-rendered
 * value would go stale on a cached page.
 */
export default function DueCountdown({
  dueAtMs,
  paid,
}: {
  dueAtMs: number | null;
  paid: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (dueAtMs == null) return;
    const tick = () => setRemaining(dueAtMs - Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [dueAtMs]);

  if (paid || dueAtMs == null || remaining == null) return null;

  if (remaining <= 0) {
    const daysLate = Math.floor(-remaining / 86_400_000);
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
        Overdue{daysLate > 0 ? ` by ${daysLate} day${daysLate === 1 ? "" : "s"}` : ""}
      </span>
    );
  }

  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const label =
    days >= 1
      ? `${days}d ${hours}h`
      : hours >= 1
        ? `${hours}h ${minutes % 60}m`
        : `${minutes}m`;

  // Inside two days it stops being a gentle reminder.
  const urgent = remaining < 2 * 86_400_000;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        urgent
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
    >
      Due in {label}
    </span>
  );
}
