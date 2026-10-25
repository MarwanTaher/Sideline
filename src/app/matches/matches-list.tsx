"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatchPhase } from "@/lib/match-phase";
import { PhaseBadge, YouChip } from "@/components/you-chip";

type MatchdayStatus = "draft" | "active" | "closed";

export type MatchListDisplayItem = {
  id: number;
  title: string;
  matchdayStatus: MatchdayStatus;
  closed: boolean;
  playerCount: number;
  statsScoringEnabled: boolean;
  dateLabel: string;
  locationName?: string;
  phase: MatchPhase;
  myStatus?: "in" | "out" | "pending";
  onRoster?: boolean;
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.title}</span>
                    <PhaseBadge phase={m.phase} />
                    <YouChip phase={m.phase} myStatus={m.myStatus} onRoster={m.onRoster} />
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
