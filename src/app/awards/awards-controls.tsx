"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { AwardMatch } from "@/lib/awards";

/** YYYY-MM-DD → DD-MM-YYYY (mirrors app.py _fmt_date). */
function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

export default function AwardsControls({
  scope,
  matchId,
  matches,
}: {
  scope: "match" | "overall";
  matchId: number | null;
  matches: AwardMatch[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const setScope = useCallback(
    (next: "match" | "overall") => {
      const sp = new URLSearchParams(params.toString());
      sp.set("scope", next);
      if (next === "overall") {
        sp.delete("match");
      } else if (!sp.get("match") && matches.length > 0) {
        sp.set("match", String(matches[0].id));
      }
      router.push(`/awards?${sp.toString()}`);
    },
    [params, router, matches],
  );

  const setMatch = useCallback(
    (id: string) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("scope", "match");
      sp.set("match", id);
      router.push(`/awards?${sp.toString()}`);
    },
    [params, router],
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/15">
        {(["overall", "match"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
              scope === s
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {scope === "match" && matches.length > 0 && (
        <select
          value={matchId ?? matches[0].id}
          onChange={(e) => setMatch(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
        >
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              Match {m.id} ({fmtDate(m.played_on)})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
