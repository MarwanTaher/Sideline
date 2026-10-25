import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { fmtDate, fmtMatchTime, getMatchDetail } from "@/lib/matches";
import {
  getMatchdayConsole,
  canRunMatchday,
  listScorekeepers,
  listAssignablePlayers,
  type Scorekeeper,
} from "@/lib/matchday";
import { MatchNav } from "../match-nav";
import { MatchdayConsole } from "./console";
import { getAvailabilityMatch } from "@/lib/availability";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { getMatchPhase } from "@/lib/match-phase";
import { MatchPageHeader } from "../match-page-header";
import { MessageAdminLink } from "@/components/message-admin-link";

export const metadata = {
  title: "Matchday console · Sideline",
};

export const dynamic = "force-dynamic";

export default async function MatchdayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const canScore = await canRunMatchday(matchId, {
    role: session.user.role,
    playerId: session.user.playerId ?? null,
  });
  if (!isAdmin && !canScore) redirect(`/matches/${matchId}`);

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

  const consoleData = await getMatchdayConsole(matchId);
  if (!consoleData) notFound();

  let scorekeepers: Scorekeeper[] = [];
  const assignablePlayers: Scorekeeper[] = await listAssignablePlayers();
  if (isAdmin) {
    scorekeepers = await listScorekeepers(matchId);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <MatchPageHeader
        matchId={matchId}
        dateLabel={`${fmtDate(match.playedOn)} at ${fmtMatchTime(match.matchTime)}`}
        title="Matchday console"
        phase={phase}
      />
      <MatchNav matchId={matchId} isAdmin={isAdmin} canScore={canScore} />
      <p className="text-sm text-neutral-500">Matchday {match.matchdayStatus}</p>

      {match.teams.length < 2 ? (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
          Draft at least two teams first — the console rotates rounds between the
          drafted teams.
          {isAdmin ? (
            <>
              {" "}
              <Link href={`/matches/${matchId}/draft`} className="font-semibold underline underline-offset-2">
                Open the lineup builder
              </Link>
              .
            </>
          ) : (
            <MessageAdminLink
              matchId={matchId}
              reason="The matchday console says teams are not ready."
            />
          )}
        </p>
      ) : (
        <div className="mt-6">
          <MatchdayConsole
            matchId={matchId}
            initial={consoleData}
            isAdmin={isAdmin}
            scorekeepers={scorekeepers}
            assignablePlayers={assignablePlayers}
          />
        </div>
      )}
    </main>
  );
}
