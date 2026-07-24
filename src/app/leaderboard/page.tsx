import { getCachedLeaderboard } from "@/lib/leaderboard";
import { getLeaderboardMovement } from "@/lib/score-snapshots";
import { getScoreBreakdown } from "@/lib/score-breakdown";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon } from "@/components/section-icon";
import LeaderboardTable from "./leaderboard-table";
import ScoreBreakdownPanel from "./score-breakdown-panel";

export const metadata = {
  title: "Leaderboard · Sideline",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
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

  const { player } = await searchParams;
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
