import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchDetail, fmtDate, fmtMatchTime, isPlayerInMatch } from "@/lib/matches";
import { getPlayerStatsState, getMatchRosterStats } from "@/lib/stats";
import { StatsForm } from "./stats-form";
import { AdminStatsEditor } from "./admin-stats-editor";
import { MatchNav } from "../match-nav";
import { getAvailabilityMatch } from "@/lib/availability";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { getMatchPhase } from "@/lib/match-phase";
import { MatchPageHeader } from "../match-page-header";

export const metadata = {
  title: "Submit stats · Sideline",
};

export const dynamic = "force-dynamic";

export default async function MatchStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  const match = await getMatchDetail(matchId);
  if (!match) notFound();
  const [availability, lockEnabled] = await Promise.all([
    getAvailabilityMatch(matchId),
    isAvailabilityLockEnabled(),
  ]);
  if (!availability) notFound();
  const phase = getMatchPhase({
    matchdayStatus: match.matchdayStatus,
    availabilityOpen: availability.availabilityOpen,
    kickoffAt: availability.kickoffAt,
    lockEnabled,
    hasRoster: match.teams.some((team) => team.players.length > 0),
  });

  const playerId = session.user.playerId;
  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const isMember =
    playerId != null && (await isPlayerInMatch(matchId, playerId));
  const openForAccess =
    match.matchdayStatus === "draft" || match.matchdayStatus === "active";
  if (!isAdmin && !isMember && !openForAccess) {
    redirect("/matches");
  }

  const rosterStats = isAdmin ? await getMatchRosterStats(matchId) : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <MatchPageHeader
        matchId={matchId}
        dateLabel={`${fmtDate(match.playedOn)} at ${fmtMatchTime(match.matchTime)}`}
        title="Submit stats"
        phase={phase}
      />
      <MatchNav matchId={matchId} isAdmin={isAdmin} />
      <p className="text-sm text-neutral-500">Matchday {match.matchdayStatus}</p>

      {isAdmin ? (
        <div className="mt-6">
          <AdminStatsEditor matchId={matchId} players={rosterStats} />
        </div>
      ) : null}

      <div className="mt-6">
        {match.matchdayStatus === "draft" ? (
          <p className="rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
            This matchday is still in draft. Stats submission will open once the
            admin activates the match.
          </p>
        ) : playerId == null ? (
          <p className="rounded-lg bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500 dark:bg-neutral-800">
            Only players can submit stats. Admins review submissions from the{" "}
            <Link href="/stats" className="underline">
              stats review
            </Link>{" "}
            page.
          </p>
        ) : (
          await renderPlayerForm(matchId, playerId)
        )}
      </div>
    </main>
  );
}

async function renderPlayerForm(matchId: number, playerId: number) {
  const state = await getPlayerStatsState(matchId, playerId);
  if (!state) notFound();

  if (!state.onRoster) {
    return (
      <p className="rounded-lg bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500 dark:bg-neutral-800">
        You are not on the roster for this match, so you cannot submit stats.
      </p>
    );
  }

  return <StatsForm matchId={matchId} open={state.open} current={state.current} />;
}
