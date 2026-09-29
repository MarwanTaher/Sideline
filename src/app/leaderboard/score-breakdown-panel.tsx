"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScoreBreakdown } from "@/lib/score-breakdown";
import { matchLabel } from "@/lib/format";

interface PlayerOption {
  id: number;
  name: string;
}

export default function ScoreBreakdownPanel({
  players,
  selectedId,
  peerWeightPct,
  statWeightPct,
  breakdown,
}: {
  players: PlayerOption[];
  selectedId: number | null;
  peerWeightPct: number;
  statWeightPct: number;
  breakdown: ScoreBreakdown | null;
}) {
  const router = useRouter();

  function onSelect(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("player", value);
    router.push(`/leaderboard${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Score breakdown</h2>

      <label className="mt-3 block text-sm text-neutral-500">
        Select player to see details
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="">— choose a player —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {breakdown && (
        <div className="mt-5">
          <div className="grid grid-cols-3 gap-3">
            <Metric
              label={`Peer Score (${peerWeightPct}%)`}
              value={breakdown.peerScore.toFixed(1)}
            />
            <Metric
              label={`Stat Score (${statWeightPct}%)`}
              value={breakdown.statScore === null ? "n/a" : breakdown.statScore.toFixed(1)}
            />
            <Metric
              label="Final Score"
              value={breakdown.finalScore.toFixed(1)}
              delta={breakdown.finalScore - 50}
            />
          </div>

          {breakdown.matches.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-medium">Recent matches (last 8)</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Match</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Peer Vote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.matches.map((m) => (
                      <tr key={m.matchId} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="px-3 py-2">
                          <Link
                            href={`/matches/${m.matchId}`}
                            className="text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100"
                          >
                            {matchLabel(m.date)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{m.date}</td>
                        <td className="px-3 py-2">
                          {m.peerVote === null ? "-" : m.peerVote.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-3 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {delta !== undefined && (
        <div
          className={`mt-0.5 text-xs tabular-nums ${
            delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}
        </div>
      )}
    </div>
  );
}
