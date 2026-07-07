import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchDetail, fmtDate, fmtMatchTime, isPlayerInMatch, type MatchdayStatus } from "@/lib/matches";
import { getMatchAdmin } from "@/lib/match-admin";
import { MatchSettings } from "./match-settings";
import { MatchNav } from "./match-nav";

export const metadata = {
  title: "Match · Sideline",
};

// Match data is read live on every request.
export const dynamic = "force-dynamic";

const MATCHDAY_BADGE: Record<MatchdayStatus, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  closed: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  const match = await getMatchDetail(matchId);
  if (!match) notFound();

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  const viewerPlayerId = session.user.playerId;
  const isMember =
    viewerPlayerId != null && (await isPlayerInMatch(matchId, viewerPlayerId));
  const openForAvailability =
    match.matchdayStatus === "draft" || match.matchdayStatus === "active";
  if (!isAdmin && !isMember && !openForAvailability) {
    redirect("/matches");
  }
  const adminMatch = isAdmin ? await getMatchAdmin(matchId) : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href="/matches"
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← All matches
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Match {match.id}</h1>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${MATCHDAY_BADGE[match.matchdayStatus]}`}
        >
          {match.matchdayStatus}
        </span>
        {match.status === "closed" ? (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            closed
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-neutral-500">
        {fmtDate(match.playedOn)} at {fmtMatchTime(match.matchTime)} · {match.numTeams} teams ·{" "}
        {match.teamSize} per side · stats scoring {match.statsScoringEnabled ? "on" : "off"}
      </p>

      <MatchNav matchId={match.id} isAdmin={isAdmin} />

      <div className="mt-3">
        <Link
          href={`/awards?scope=match&match=${match.id}`}
          className="text-sm text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
        >
          View match awards →
        </Link>
      </div>

      {isAdmin || isMember ? (
      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Teams</h2>
        {match.teams.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No teams drafted yet.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {match.teams.map((team) => (
              <div
                key={team.teamNo}
                className="rounded-xl border border-black/10 p-4 dark:border-white/10"
              >
                <h3 className="text-sm font-semibold">
                  Team {team.teamNo}{" "}
                  <span className="font-normal text-neutral-400">
                    ({team.players.length})
                  </span>
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {team.players.map((p) => (
                    <li key={p.playerId} className="flex items-center justify-between">
                      <span>
                        {p.isGuest ? (
                          <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                            Guest
                          </span>
                        ) : null}
                        {p.name}
                        {p.isGuest && p.hostName ? (
                          <span className="text-xs text-neutral-500"> · of {p.hostName}</span>
                        ) : null}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {p.position}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Approved stats</h2>
        {match.stats.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No approved stats for this match.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Player</th>
                  <th className="px-4 py-2 font-medium">Goals</th>
                  <th className="px-4 py-2 font-medium">Assists</th>
                </tr>
              </thead>
              <tbody>
                {match.stats.map((s) => (
                  <tr key={s.name} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2">{s.goals}</td>
                    <td className="px-4 py-2">{s.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adminMatch ? <MatchSettings match={adminMatch} /> : null}
    </main>
  );
}
