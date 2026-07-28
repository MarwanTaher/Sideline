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

  const consoleData = await getMatchdayConsole(matchId);
  if (!consoleData) notFound();

  let scorekeepers: Scorekeeper[] = [];
  let assignablePlayers: Scorekeeper[] = [];
  if (isAdmin) {
    [scorekeepers, assignablePlayers] = await Promise.all([
      listScorekeepers(matchId),
      listAssignablePlayers(),
    ]);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Match {matchId}
      </Link>

      <MatchNav matchId={matchId} isAdmin={isAdmin} canScore={canScore} />

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Matchday console</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {fmtDate(match.playedOn)} at {fmtMatchTime(match.matchTime)} · matchday{" "}
        {match.matchdayStatus}
      </p>

      {match.teams.length < 2 ? (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
          Draft at least two teams first — the console rotates rounds between the
          drafted teams.
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
