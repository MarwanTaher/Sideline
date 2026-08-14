"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DataTable } from "@/components/ui/data-table";

const POSITIONS = ["All", "GK", "DEF", "MID", "FWD"] as const;
const MIN_MATCH_OPTIONS = [0, 1, 2, 3, 5] as const;

function fmt1(n: number): string {
  return n.toFixed(1);
}

type Movement = { rankDelta: number | null; scoreDelta: number | null };

/** Green ▲ / red ▼ / neutral – for a player's rank change since last match. */
function MovementCell({ move }: { move: Movement | undefined }) {
  if (!move || move.rankDelta === null) {
    return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
  }
  const { rankDelta, scoreDelta } = move;
  const scoreText =
    scoreDelta != null && Math.abs(scoreDelta) >= 0.05
      ? ` ${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(1)}`
      : "";
  if (rankDelta > 0) {
    return (
      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
        ▲{rankDelta}
        <span className="text-neutral-400">{scoreText}</span>
      </span>
    );
  }
  if (rankDelta < 0) {
    return (
      <span className="tabular-nums text-rose-600 dark:text-rose-400">
        ▼{Math.abs(rankDelta)}
        <span className="text-neutral-400">{scoreText}</span>
      </span>
    );
  }
  return (
    <span className="tabular-nums text-neutral-400">
      –<span>{scoreText}</span>
    </span>
  );
}

export default function LeaderboardTable({
  rows,
  unratedMinMatches,
  showDetails = true,
  movement = {},
}: {
  rows: LeaderboardRow[];
  unratedMinMatches: number;
  showDetails?: boolean;
  movement?: Record<number, Movement>;
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

      <DataTable className="mt-4 rounded-2xl border border-black/[0.06] shadow-sm dark:border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-neutral-50 text-left dark:border-white/10 dark:bg-neutral-900">
              <th scope="col" className="px-3 py-2 font-medium text-neutral-500">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Player</th>
              <th scope="col" className="px-3 py-2 font-medium">Pos</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Matches</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Move</th>
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
                  colSpan={showDetails ? 9 : 7}
                  className="px-3 py-6 text-center text-neutral-500"
                >
                  No players match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-black/5 transition last:border-0 hover:bg-neutral-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/players/${r.id}`}
                      className="flex items-center gap-2 transition hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                      <Avatar name={r.name} photoUrl={r.photoUrl} size="xs" />
                      <span className="font-medium">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">{r.position}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.matches}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={r.ranked ? "success" : "neutral"} dot>
                      {r.ranked ? "Ranked" : "Unranked"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <MovementCell move={movement[r.id]} />
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
