"use client";

import Link from "next/link";
import { useState } from "react";

type MatchdayStatus = "draft" | "active" | "closed";

export type MatchListDisplayItem = {
  id: number;
  matchdayStatus: MatchdayStatus;
  closed: boolean;
  playerCount: number;
  statsScoringEnabled: boolean;
  dateLabel: string;
  locationName?: string;
};

const MATCHDAY_BADGE: Record<MatchdayStatus, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  closed: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function MatchesList({ items }: { items: MatchListDisplayItem[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const shown = items.filter((m) =>
    filter === "upcoming"
      ? m.matchdayStatus !== "closed"
      : filter === "past"
        ? m.matchdayStatus === "closed"
        : true,
  );

  return (
    <div className="mt-6">
      <div className="inline-flex rounded-xl border border-black/10 p-0.5 text-sm dark:border-white/15">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-lg px-3 py-1.5 font-medium transition active:scale-[0.97] ${
              filter === f.key
                ? "bg-emerald-600 text-white"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">No matches in this view.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((m) => (
            <li key={m.id}>
              <Link
                href={`/matches/${m.id}`}
                className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Match {m.id}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${MATCHDAY_BADGE[m.matchdayStatus]}`}
                    >
                      {m.matchdayStatus}
                    </span>
                    {m.closed ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        closed
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-neutral-500">{m.dateLabel}</div>
                  {m.locationName ? (
                    <div className="mt-0.5 truncate text-xs text-neutral-400">
                      {m.locationName.split(",")[0]}
                    </div>
                  ) : null}
                </div>
                <div className="text-right text-sm text-neutral-500">
                  <div className="tabular-nums">
                    {m.playerCount} player{m.playerCount === 1 ? "" : "s"}
                  </div>
                  {m.statsScoringEnabled ? (
                    <div className="text-xs text-neutral-400">stats scoring on</div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
