import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { matchLabel } from "@/lib/format";
import { getMatchDetail, fmtMatchTime, isPlayerInMatch } from "@/lib/matches";
import { getMatchAdmin } from "@/lib/match-admin";
import { canRunMatchday } from "@/lib/matchday";
import { getReactionSummary } from "@/lib/reactions";
import { getMatchDigest, buildDigestShareText } from "@/lib/match-digest";
import { getBaseUrl } from "@/lib/site-url";
import { getMatchWeather } from "@/lib/weather";
import { googleMapsUrl } from "@/lib/geo-links";
import { WeatherIcon } from "@/components/ui/weather-icon";
import { MatchSettings } from "./match-settings";
import { MatchNav } from "./match-nav";
import { TeamsView } from "./teams-view";
import { MatchSocial } from "./match-social";
import { SectionIcon } from "@/components/section-icon";
import { PhaseStrip } from "@/components/phase-strip";
import { YouChip } from "@/components/you-chip";
import { getMatchPhase, phaseAction } from "@/lib/match-phase";
import { getAvailabilityMatch, getPlayerAvailabilityStatus } from "@/lib/availability";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";

export const metadata = {
  title: "Match · Sideline",
};

// Match data is read live on every request.
export const dynamic = "force-dynamic";

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

  const [reactions, digest, baseUrl, weather, availMeta, lockEnabled, myStatus] = await Promise.all([
    getReactionSummary(matchId, viewerPlayerId ?? null),
    getMatchDigest(matchId),
    getBaseUrl(),
    getMatchWeather(match.locationLat, match.locationLng, match.playedOn, match.matchTime),
    getAvailabilityMatch(matchId),
    isAvailabilityLockEnabled(),
    viewerPlayerId != null
      ? getPlayerAvailabilityStatus(matchId, viewerPlayerId)
      : Promise.resolve(undefined),
  ]);
  const phase = getMatchPhase({
    matchdayStatus: match.matchdayStatus,
    availabilityOpen: availMeta?.availabilityOpen ?? true,
    kickoffAt: availMeta?.kickoffAt ?? null,
    lockEnabled,
    hasRoster,
  });
  const nextStep = phaseAction(phase, matchId, {
    isAdmin,
    canScore,
    onRoster: isMember,
    myStatus,
  });
  const shareUrl = baseUrl ? `${baseUrl}/share/match/${matchId}` : "";
  const shareText = digest ? buildDigestShareText(digest, shareUrl) : "";
  const icsHref = `/api/matches/${matchId}/calendar`;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href="/matches"
        className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-emerald-500/40 hover:text-emerald-700 active:scale-[0.97] dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:text-emerald-300"
      >
        <span aria-hidden="true">←</span> All matches
      </Link>

      <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <SectionIcon name="matches" className="h-9 w-9" />
            <h1 className="text-2xl font-bold tracking-tight">{matchLabel(match.playedOn)}</h1>
          <YouChip phase={phase} myStatus={myStatus} onRoster={isMember} />
        </div>
        <PhaseStrip phase={phase} className="mt-3" />
        {nextStep ? (
          <Link
            href={nextStep.href}
            className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            <span>{nextStep.label}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {phase === "done" ? (
          <Link
            href={`/matches/${matchId}/recap`}
            className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-neutral-800 to-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
          >
            <span>▶ Matchday recap</span>
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            fmtMatchTime(match.matchTime),
            `${match.numTeams} teams × ${match.teamSize}`,
            isAdmin ? `stats scoring ${match.statsScoringEnabled ? "on" : "off"}` : "",
          ].filter(Boolean).map((chip) => (
            <span
              key={chip}
              className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300"
            >
              {chip}
            </span>
          ))}
        </div>

        {match.locationName || (match.locationLat != null && match.locationLng != null) || match.venue ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/5 pt-3 text-sm dark:border-white/10">
            {match.locationName || (match.locationLat != null && match.locationLng != null) ? (
              <span
                className="inline-flex min-w-0 items-center gap-1.5 font-medium"
                title={match.locationName || undefined}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                  <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <span className="truncate">{match.locationName.split(",")[0] || "Field location"}</span>
              </span>
            ) : null}
            {match.venue ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  match.venue === "indoor"
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                }`}
              >
                {match.venue === "indoor" ? "Indoor" : "Outdoor"}
              </span>
            ) : null}
            {match.locationLat != null && match.locationLng != null ? (
              <a
                href={googleMapsUrl(match.locationLat, match.locationLng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-400"
              >
                Open in Google Maps <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
        ) : null}

        {weather ? (
          <div className="mt-2">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
              <WeatherIcon code={weather.code} className="h-5 w-5 shrink-0" />
              <span className="font-semibold">Forecast · {weather.timeLabel}</span>
              <span>{weather.tempC}°C</span>
              <span className="text-sky-400">·</span>
              <span>{weather.label}</span>
              <span className="text-sky-400">·</span>
              <span>Rain {weather.precipProb}%</span>
              <span className="text-sky-400">·</span>
              <span>Wind {weather.windKph} km/h</span>
            </span>
          </div>
        ) : null}
      </div>

      <MatchNav matchId={match.id} isAdmin={isAdmin} canScore={canScore} highlightHref={nextStep?.href} />

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
          <div className="mt-3 overflow-hidden rounded-2xl border border-black/[0.06] shadow-sm dark:border-white/10">
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
