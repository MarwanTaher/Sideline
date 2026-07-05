"use client";

import { useMemo, useState } from "react";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";

const POSITIONS = ["All", "GK", "DEF", "MID", "FWD"] as const;
const MIN_MATCH_OPTIONS = [0, 1, 2, 3, 5] as const;

function fmt1(n: number): string {
  return n.toFixed(1);
}

export default function LeaderboardTable({
  rows,
  unratedMinMatches,
  showDetails = true,
}: {
  rows: LeaderboardRow[];
  unratedMinMatches: number;
  showDetails?: boolean;
}) {
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [minMatches, setMinMatches] = useState<number>(0);
  const [showUnranked, setShowUnranked] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (position !== "All" && r.position !== position) return false;
      if (!showUnranked && r.matches < unratedMinMatches) return false;
      if (r.matches < minMatches) return false;
      return true;
    });
  }, [rows, position, minMatches, showUnranked, unratedMinMatches]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Position</span>
          <select
            value={position}
            onChange={(e) =>
              setPosition(e.target.value as (typeof POSITIONS)[number])
            }
            className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Min matches</span>
          <select
            value={minMatches}
            onChange={(e) => setMinMatches(Number(e.target.value))}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
          >
            {MIN_MATCH_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showUnranked}
            onChange={(e) => setShowUnranked(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Show unranked players</span>
        </label>
      </div>

      <DataTable className="mt-4 rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-neutral-50 text-left dark:border-white/10 dark:bg-neutral-900">
              <th scope="col" className="px-3 py-2 font-medium text-neutral-500">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Player</th>
              <th scope="col" className="px-3 py-2 font-medium">Pos</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Matches</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              {showDetails ? (
                <>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Peer</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Stat</th>
                </>
              ) : null}
              <th scope="col" className="px-3 py-2 text-right font-medium">Final</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={showDetails ? 8 : 6}
                  className="px-3 py-6 text-center text-neutral-500"
                >
                  No players match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.position}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.matches}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={r.ranked ? "success" : "neutral"} dot>
                      {r.ranked ? "Ranked" : "Unranked"}
                    </Badge>
                  </td>
                  {showDetails ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt1(r.peer)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.stat === null ? "—" : fmt1(r.stat)}
                      </td>
                    </>
                  ) : null}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmt1(r.final)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTable>

      <p className="mt-2 text-xs text-neutral-400">
        Showing {filtered.length} of {rows.length} active players.
      </p>
    </div>
  );
}
