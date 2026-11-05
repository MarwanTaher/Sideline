"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/match-schedule";

export function SignupWindow({ opensAt, kickoffAt, open, serverNow, durationMinutes }: { opensAt: string; kickoffAt: string | null; open: boolean; serverNow: number; durationMinutes?: number }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const boundaries = [Date.parse(opensAt), kickoffAt ? Date.parse(kickoffAt) - 86400000 : NaN].filter((ms) => ms > serverNow);
    let refreshed = false;
    const tick = () => {
      const delta = performance.now() - start;
      setElapsed(delta);
      if (!refreshed && boundaries.some((ms) => ms <= serverNow + delta)) {
        refreshed = true;
        router.refresh();
      }
    };
    const timer = setInterval(tick, 1000);
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [opensAt, kickoffAt, serverNow, router]);
  const remaining = Date.parse(opensAt) - serverNow - elapsed;
  const locked = kickoffAt != null && serverNow + elapsed >= Date.parse(kickoffAt) - 86400000;
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(opensAt));
  const ends = kickoffAt && durationMinutes ? new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Warsaw",hour:"2-digit",minute:"2-digit"}).format(new Date(Date.parse(kickoffAt)+durationMinutes*60000)) : null;
  return <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
    {ends ? <p>Booked for {durationMinutes} minutes, until {ends} Warsaw time.</p> : null}
    <p>{locked ? "Player changes and seat swaps are locked. Contact an admin for changes." : open ? "Public signup is open. Claim a place or join the waitlist." : remaining > 0 ? `Public signup opens ${label} (Warsaw), in ${formatDuration(remaining)}.` : "Public signup is paused or closed. Contact an admin."}</p>
  </div>;
}
