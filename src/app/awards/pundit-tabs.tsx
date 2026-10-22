"use client";

import { useState } from "react";
import Link from "next/link";
import type { PunditRow } from "@/lib/predictions";

const MAX_ROWS = 10;

type View = "season" | "all";

/** Competition ranking: equal points share a rank. */
function ranked(rows: PunditRow[]): Array<PunditRow & { rank: number }> {
  let rank = 0;
  let prev: number | null = null;
  return rows.map((r, i) => {
    if (r.points !== prev) {
      rank = i + 1;
      prev = r.points;
    }
    return { ...r, rank };
  });
}

export function PunditTabs({
  season,
  allTime,
  myPlayerId,
}: {
  season: { id: number; name: string; rows: PunditRow[] } | null;
  allTime: PunditRow[];
  myPlayerId: number | null;
}) {
  const [view, setView] = useState<View>(season ? "season" : "all");
  const active = view === "season" && season ? season.rows : allTime;
  const rows = ranked(active);
  const top = rows.slice(0, MAX_ROWS);
  const me = rows.find((r) => r.playerId === myPlayerId);
  const shown = me && !top.includes(me) ? [...top, me] : top;

  const leaderPoints = season?.rows[0]?.points ?? 0;
  const seasonLeaders =
    season && leaderPoints > 0 ? season.rows.filter((r) => r.points === leaderPoints) : [];

  const chip = (selected: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      selected
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        : "border border-black/10 text-neutral-600 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;

  return (
    <div className="mt-3">
      {seasonLeaders.length > 0 ? (
        <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
          <span className="font-semibold">Pundit of the Season:</span>{" "}
          {seasonLeaders.map((r) => r.name).join(" & ")}{" "}
          <span className="tabular-nums text-violet-600 dark:text-violet-300">· {leaderPoints} pts</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pundit leaderboard period">
        {season ? (
          <button
            type="button"
            aria-pressed={view === "season"}
            className={chip(view === "season")}
            onClick={() => setView("season")}
          >
            {season.name}
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={view === "all" || !season}
          className={chip(view === "all" || !season)}
          onClick={() => setView("all")}
        >
          All time
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No scored predictions yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/[0.06] bg-white text-sm shadow-sm dark:divide-white/5 dark:border-white/10 dark:bg-neutral-900">
          {shown.map((r) => {
            const isMe = r.playerId === myPlayerId;
            return (
              <li
                key={r.playerId}
                className={`flex items-center gap-3 px-4 py-2 ${isMe ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
              >
                <span className="w-6 shrink-0 text-xs tabular-nums text-neutral-400">{r.rank}</span>
                <Link
                  href={`/players/${r.playerId}`}
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  {r.name}
                  {isMe ? <span className="font-normal text-neutral-400"> · you</span> : null}
                </Link>
                <span className="text-xs tabular-nums text-neutral-500">
                  {r.scored} pick{r.scored === 1 ? "" : "s"}
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">{r.points} pts</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
