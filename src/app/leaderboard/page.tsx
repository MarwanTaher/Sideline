import Link from "next/link";
import { getCachedLeaderboard } from "@/lib/leaderboard";
import { getLeaderboardMovement } from "@/lib/score-snapshots";
import { getScoreBreakdown } from "@/lib/score-breakdown";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon } from "@/components/section-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { TrophyIcon } from "@/components/ui/icons";
import LeaderboardTable from "./leaderboard-table";
import ScoreBreakdownPanel from "./score-breakdown-panel";
import SeasonStandings from "./season-standings";
import { listSeasons, getSeasonStandings, type Season } from "@/lib/seasons";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = {
  title: "Leaderboard · Sideline",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; season?: string }>;
}) {
  const [{ rows, peerWeightPct, statWeightPct, unratedMinMatches }, movementMap] =
    await Promise.all([getCachedLeaderboard(), getLeaderboardMovement()]);

  // Map<number, MovementInfo> isn't reliably serialisable into a client
  // component — hand it a plain record keyed by player id.
  const movement: Record<
    number,
    { rankDelta: number | null; scoreDelta: number | null }
  > = {};
  for (const [id, m] of movementMap) movement[id] = m;

  const session = await auth();
  const showDetails = await isAdminView(
    session?.user?.role === "admin" || session?.user?.role === "super",
  );

  const rankedRows = rows.filter((r) => r.ranked);
  const top3 = rankedRows.slice(0, 3);
  const myPlayerId = session?.user?.playerId ?? null;
  const myIndex = myPlayerId != null ? rankedRows.findIndex((r) => r.id === myPlayerId) : -1;
  const me = myIndex >= 0 ? rankedRows[myIndex] : null;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const topPct =
    me && rankedRows.length > 0 ? Math.ceil(((myRank as number) / rankedRows.length) * 100) : null;

  const { player, season } = await searchParams;
  const seasons = await listSeasons();
  const seasonId = season ? Number(season) : NaN;
  const selectedSeason =
    Number.isFinite(seasonId) ? seasons.find((s) => s.id === seasonId) ?? null : null;

  if (selectedSeason) {
    const standings = await getSeasonStandings(selectedSeason.id);
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <SubNav
          className="mb-6"
          ariaLabel="Standings"
          items={[
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/awards", label: "Awards" },
          ]}
        />
        <div className="flex items-center gap-3">
          <SectionIcon name="leaderboard" className="h-9 w-9" />
          <h1 className="text-2xl font-semibold tracking-tight">{selectedSeason.name}</h1>
        </div>
        <SeasonPicker seasons={seasons} activeId={selectedSeason.id} />
        <SeasonStandings season={selectedSeason} rows={standings} />
      </main>
    );
  }

  const parsedId = player ? Number(player) : NaN;
  const selectedId =
    showDetails && Number.isFinite(parsedId) && rows.some((r) => r.id === parsedId)
      ? parsedId
      : null;
  const breakdown = selectedId !== null ? await getScoreBreakdown(selectedId) : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <SubNav
        className="mb-6"
        ariaLabel="Standings"
        items={[
          { href: "/leaderboard", label: "Leaderboard" },
          { href: "/awards", label: "Awards" },
        ]}
      />
      <div className="flex items-center gap-3">
        <SectionIcon name="leaderboard" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
      </div>

      <SeasonPicker seasons={seasons} activeId={null} />

      <p className="mt-1 text-sm text-neutral-500">
        Curious how these are worked out?{" "}
        <a
          href="/leaderboard/how-scoring-works"
          className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-400"
        >
          See how scores work
        </a>
        .
      </p>

      {showDetails ? (
        <>
          <p className="mt-1 text-sm text-neutral-500">
            Active blend:{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Peer {peerWeightPct}% / Stats {statWeightPct}%
            </span>
            . Stats apply only to matches with stats scoring enabled and approved
            stats present.
          </p>
          {statWeightPct === 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Stats weight is 0% — stats do not affect ranking.
            </p>
          )}
        </>
      ) : null}

      {top3.length === 3 ? (
        <div className="mt-6 grid grid-cols-3 items-end gap-2">
          {[top3[1], top3[0], top3[2]].map((r, i) => {
            const place = [2, 1, 3][i];
            const bar =
              place === 1
                ? "h-16 bg-amber-400"
                : place === 2
                  ? "h-12 bg-neutral-300 dark:bg-neutral-600"
                  : "h-10 bg-orange-400/80";
            return (
              <div key={r.id} className="flex flex-col items-center">
                {place === 1 ? <TrophyIcon className="mb-1 h-5 w-5 text-amber-500" /> : null}
                <Link
                  href={`/players/${r.id}`}
                  className="flex flex-col items-center transition hover:opacity-80"
                >
                  <Avatar name={r.name} photoUrl={r.photoUrl} size={place === 1 ? "lg" : "md"} />
                  <p className="mt-1 max-w-full truncate text-xs font-medium">{r.name}</p>
                </Link>
                <p className="text-xs tabular-nums text-neutral-500">{r.final.toFixed(1)}</p>
                <div className={`mt-1 flex w-full items-center justify-center rounded-t-lg font-heading text-sm font-bold text-white ${bar}`}>
                  {place}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {me ? (
        <Card accent="#059669" className="mt-4 flex items-center gap-3 bg-emerald-50/50 dark:bg-emerald-950/20">
          <Avatar name={me.name} photoUrl={me.photoUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {me.name} <span className="font-normal text-neutral-400">· you</span>
            </p>
            <p className="text-xs tabular-nums text-neutral-500">
              Score {me.final.toFixed(1)} · Top {topPct}%
            </p>
          </div>
          <p className="font-heading text-xl font-bold tabular-nums">
            #{myRank}
            <span className="text-sm font-normal text-neutral-400"> of {rankedRows.length}</span>
          </p>
        </Card>
      ) : null}

      {rankedRows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="The leaderboard is warming up"
          action={
            <Link
              href="/matches"
              className="inline-flex min-h-11 items-center rounded-lg bg-neutral-900 px-4 font-semibold text-white dark:bg-white dark:text-neutral-900"
            >
              Find a match
            </Link>
          }
        >
          Players appear in the ranks after {unratedMinMatches} completed match
          {unratedMinMatches === 1 ? "" : "es"}.
        </EmptyState>
      ) : null}

      <LeaderboardTable
        rows={rows}
        unratedMinMatches={unratedMinMatches}
        showDetails={showDetails}
        movement={movement}
      />

      {showDetails ? (
        <ScoreBreakdownPanel
          players={rows.map((r) => ({ id: r.id, name: r.name }))}
          selectedId={selectedId}
          peerWeightPct={peerWeightPct}
          statWeightPct={statWeightPct}
          breakdown={breakdown}
        />
      ) : null}
    </main>
  );
}

/** All-time plus one entry per season; seasons keep the table catchable. */
function SeasonPicker({
  seasons,
  activeId,
}: {
  seasons: Season[];
  activeId: number | null;
}) {
  if (seasons.length === 0) return null;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        : "border border-black/10 text-neutral-600 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <Link href="/leaderboard" className={chip(activeId === null)}>
        All time
      </Link>
      {seasons.map((s) => (
        <Link
          key={s.id}
          href={`/leaderboard?season=${s.id}`}
          className={chip(activeId === s.id)}
        >
          {s.name}
        </Link>
      ))}
    </div>
  );
}