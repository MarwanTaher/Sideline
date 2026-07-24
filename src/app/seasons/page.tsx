import Link from "next/link";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon } from "@/components/section-icon";
import { listSeasons, getActiveSeason, getSeason, getSeasonStats } from "@/lib/seasons";
import SeasonAdmin from "./season-admin";

export const metadata = {
  title: "Seasons · Sideline",
};

export const dynamic = "force-dynamic";

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth();
  const isAdmin = await isAdminView(
    session?.user?.role === "admin" || session?.user?.role === "super",
  );

  const [seasons, active] = await Promise.all([listSeasons(), getActiveSeason()]);

  const { season: seasonParam } = await searchParams;
  let selectedId: number | null;
  if (seasonParam === "all") selectedId = null;
  else if (seasonParam && Number.isFinite(Number(seasonParam))) selectedId = Number(seasonParam);
  else selectedId = active?.id ?? null;

  const selectedSeason = selectedId != null ? await getSeason(selectedId) : null;
  const stats = await getSeasonStats(selectedId);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <SubNav
        className="mb-6"
        ariaLabel="Standings"
        items={[
          { href: "/leaderboard", label: "Leaderboard" },
          { href: "/awards", label: "Awards" },
          { href: "/seasons", label: "Seasons" },
        ]}
      />
      <div className="flex items-center gap-3">
        <SectionIcon name="leaderboard" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Seasons</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Season standings are based on results (appearances, goals, assists, wins). Your all-time
        skill rating lives on the{" "}
        <Link href="/leaderboard" className="font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400">
          leaderboard
        </Link>
        .
      </p>

      {/* Season selector */}
      <div className="mt-5 flex flex-wrap gap-2">
        <SeasonChip href="/seasons?season=all" label="All time" active={selectedId === null} />
        {seasons.map((s) => (
          <SeasonChip
            key={s.id}
            href={`/seasons?season=${s.id}`}
            label={`${s.name}${s.status === "active" ? " · live" : ""}`}
            active={selectedId === s.id}
          />
        ))}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">
          {selectedSeason ? selectedSeason.name : "All time"}
        </h2>
        {stats.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No matches with results in this scope yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Player</th>
                  <th className="px-4 py-2 font-medium">P</th>
                  <th className="px-4 py-2 font-medium">W</th>
                  <th className="px-4 py-2 font-medium">G</th>
                  <th className="px-4 py-2 font-medium">A</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((r, i) => (
                  <tr key={r.playerId} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2">{r.appearances}</td>
                    <td className="px-4 py-2">{r.wins}</td>
                    <td className="px-4 py-2">{r.goals}</td>
                    <td className="px-4 py-2">{r.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin ? (
        <div className="mt-8">
          <SeasonAdmin activeSeason={active} />
        </div>
      ) : null}
    </main>
  );
}

function SeasonChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-black/15 text-neutral-600 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-900"
      }`}
    >
      {label}
    </Link>
  );
}
