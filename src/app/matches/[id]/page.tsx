import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchDetail, fmtDate, fmtMatchTime, isPlayerInMatch, type MatchdayStatus } from "@/lib/matches";
import { getMatchAdmin } from "@/lib/match-admin";
import { canRunMatchday } from "@/lib/matchday";
import { getReactionSummary } from "@/lib/reactions";
import { getMatchDigest, buildDigestShareText } from "@/lib/match-digest";
import { getBaseUrl } from "@/lib/site-url";
import { MatchSettings } from "./match-settings";
import { MatchNav } from "./match-nav";
import { TeamsView } from "./teams-view";
import { MatchSocial } from "./match-social";

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
  const canScore =
    isAdmin ||
    (await canRunMatchday(matchId, { role, playerId: viewerPlayerId ?? null }));

  // Social hub data (reactions, share). Rostered players may interact.
  const canInteract = isMember;
  const hasRoster = match.teams.some((t) => t.players.length > 0);

  const [reactions, digest, baseUrl] = await Promise.all([
    getReactionSummary(matchId, viewerPlayerId ?? null),
    getMatchDigest(matchId),
    getBaseUrl(),
  ]);
  const shareUrl = baseUrl ? `${baseUrl}/share/match/${matchId}` : "";
  const shareText = digest ? buildDigestShareText(digest, shareUrl) : "";
  const icsHref = `/api/matches/${matchId}/calendar`;

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

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          fmtDate(match.playedOn),
          fmtMatchTime(match.matchTime),
          `${match.numTeams} teams`,
          `${match.teamSize} per side`,
          `stats scoring ${match.statsScoringEnabled ? "on" : "off"}`,
        ].map((chip) => (
          <span
            key={chip}
            className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300"
          >
            {chip}
          </span>
        ))}
      </div>

      <MatchNav matchId={match.id} isAdmin={isAdmin} canScore={canScore} />

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
          <TeamsView teams={match.teams} />
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

      {(isAdmin || isMember) && hasRoster ? (
        <MatchSocial
          matchId={match.id}
          canInteract={canInteract}
          reactions={reactions}
          shareText={shareText}
          shareUrl={shareUrl}
          icsHref={icsHref}
        />
      ) : null}

      {adminMatch ? <MatchSettings match={adminMatch} /> : null}
    </main>
  );
}
