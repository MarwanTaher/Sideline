import Link from "next/link";
import type { Season, SeasonStandingRow } from "@/lib/seasons";
import { Avatar } from "@/components/ui/avatar";
import { DataTable } from "@/components/ui/data-table";

/**
 * Season standings are appearance/goal/result based on purpose. The all-time
 * table's peer-vote score blends every match ever played and is not
 * season-scoped, so presenting it under a season heading would be a lie.
 */
export default function SeasonStandings({
  season,
  rows,
}: {
  season: Season;
  rows: SeasonStandingRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-xl bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:bg-neutral-900">
        No matches played in {season.name} yet.
      </p>
    );
  }

  return (
    <>
      <p className="mt-1 text-sm text-neutral-500">
        {season.startDate} → {season.endDate ?? "ongoing"} · ranked by win rate
        across mini-matches.
      </p>
      <DataTable className="mt-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-2 pr-3">#</th>
              <th scope="col" className="py-2 pr-3">Player</th>
              <th scope="col" className="py-2 pr-3 text-right">Apps</th>
              <th scope="col" className="py-2 pr-3 text-right">G</th>
              <th scope="col" className="py-2 pr-3 text-right">A</th>
              <th scope="col" className="py-2 pr-3 text-right">W-D-L</th>
              <th scope="col" className="py-2 pr-3 text-right">Win %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId} className="border-t border-black/5 dark:border-white/5">
                <td className="py-2 pr-3 tabular-nums text-neutral-400">{i + 1}</td>
                <td className="py-2 pr-3">
                  <Link
                    href={`/players/${r.playerId}`}
                    className="flex items-center gap-2 font-medium transition hover:opacity-80"
                  >
                    <Avatar name={r.name} photoUrl={r.photoUrl} size="xs" />
                    <span className="truncate">{r.name}</span>
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.matches}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.goals}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.assists}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">
                  {r.wins}-{r.draws}-{r.losses}
                </td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                  {r.winRate == null ? "—" : `${Math.round(r.winRate * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </>
  );
}
