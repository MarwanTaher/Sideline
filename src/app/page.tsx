import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { fmtDate, fmtMatchTime, matchLabel } from "@/lib/format";
import KickoffCountdown from "@/components/kickoff-countdown";
import {
  getActiveSubscriptionSeason,
  getSubscription,
  countActiveSubscribers,
  getSubscriberIdsForMatch,
} from "@/lib/season-subscriptions";
import { listPlayerInvoices } from "@/lib/season-billing";
import { formatMinor } from "@/lib/format-money";
import { getPlayerRank } from "@/lib/leaderboard";
import { CountUp } from "@/components/count-up";
import { getLeaderboardMovement } from "@/lib/score-snapshots";
import { getPendingVoteObligation } from "@/lib/voting";
import { getLastMatchdayOutcome } from "@/lib/matchday";
import { getStatsReviewCounts } from "@/lib/stats";
import { getPlayersAdminData } from "@/lib/players-admin";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { msUntilLock } from "@/lib/match-schedule";
import { getMatchPhase, type MatchPhase } from "@/lib/match-phase";
import { getHomeMatch, getHomeAdminCounts, getRecentForm, type HomeMatch } from "@/lib/home";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedBar } from "@/components/ui/segmented-bar";
import { SectionIcon } from "@/components/section-icon";
import { PhaseStrip } from "@/components/phase-strip";
import NotificationPrompt from "@/components/notification-prompt";
import InstallPrompt from "@/components/install-prompt";
import { AvailabilityControls } from "./matches/[id]/availability/availability-controls";
import { StoriesRow } from "@/components/stories-row";
import { getPlayerPhoto, listActiveStories } from "@/lib/stories";

export const dynamic = "force-dynamic";

type Todo = { key: string; href: string; title: string; sub: string; tone: "emerald" | "amber" | "sky" };

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { name, role, playerId } = session.user;
  const isAdmin = await isAdminView(role === "admin" || role === "super");

  const [match, rankInfo, movement, voteObligation, lastMatchday, form, season, lockEnabled, stories, myPhoto] =
    await Promise.all([
      getHomeMatch(playerId ?? null),
      playerId != null ? getPlayerRank(playerId) : Promise.resolve(null),
      playerId != null ? getLeaderboardMovement() : Promise.resolve(null),
      playerId != null ? getPendingVoteObligation(playerId) : Promise.resolve(null),
      playerId != null ? getLastMatchdayOutcome(playerId) : Promise.resolve(null),
      playerId != null ? getRecentForm(playerId) : Promise.resolve([]),
      getActiveSubscriptionSeason(),
      isAvailabilityLockEnabled(),
      playerId != null ? listActiveStories(Number(playerId)).catch(() => []) : Promise.resolve([]),
      playerId != null ? getPlayerPhoto(Number(playerId)).catch(() => null) : Promise.resolve(null),
    ]);

  const phase: MatchPhase | null = match
    ? getMatchPhase({
        matchdayStatus: match.matchdayStatus,
        availabilityOpen: match.availabilityOpen,
        kickoffAt: match.kickoffAt,
        lockEnabled,
        hasRoster: match.hasRoster,
      })
    : null;
  const rankDelta = playerId != null ? (movement?.get(playerId)?.rankDelta ?? null) : null;

  const seasonVisible = season != null && (season.visibleToPlayers || isAdmin);
  const [subscriberIds, mySubscription, takenSeats, invoices, adminCounts, statsCounts, playersAdmin] =
    await Promise.all([
      match && (phase === "open" || phase === "locked")
        ? getSubscriberIdsForMatch(match.id)
        : Promise.resolve(new Set<number>()),
      seasonVisible && playerId != null ? getSubscription(season.id, playerId) : Promise.resolve(null),
      seasonVisible && season.signupOpen ? countActiveSubscribers(season.id) : Promise.resolve(0),
      seasonVisible && playerId != null ? listPlayerInvoices(season.id, playerId) : Promise.resolve([]),
      isAdmin ? getHomeAdminCounts(match?.id ?? null, seasonVisible ? season.id : null) : Promise.resolve(null),
      isAdmin ? getStatsReviewCounts() : Promise.resolve(null),
      isAdmin ? getPlayersAdminData() : Promise.resolve(null),
    ]);

  // ── To do: at most three things the player actually has to act on. ──
  const todos: Todo[] = [];
  if (voteObligation) {
    todos.push({
      key: "vote",
      href: `/matches/${voteObligation.matchId}/vote`,
      title: `Rate your teammates · ${matchLabel(voteObligation.playedOn)}`,
      sub: "Voting is open. It takes a minute.",
      tone: "emerald",
    });
  }
  const unpaid = invoices.find((i) => !i.paidAt && !i.declaredPaidAt && i.totalMinor > 0);
  if (unpaid) {
    todos.push({
      key: "invoice",
      href: "/season?tab=payments",
      title: `Season payment · ${formatMinor(unpaid.totalMinor)}`,
      sub: `For ${unpaid.period}, due ${fmtDate(unpaid.dueDate)}.`,
      tone: "amber",
    });
  }
  const spotsLeft = season ? season.subscriberCap - takenSeats : 0;
  if (seasonVisible && season.signupOpen && mySubscription?.status !== "active" && spotsLeft > 0) {
    todos.push({
      key: "season",
      href: "/season",
      title: `${season.name} · ${spotsLeft} place${spotsLeft === 1 ? "" : "s"} left`,
      sub: "Commit for the season and you're IN every week automatically.",
      tone: "sky",
    });
  }

  const adminItems: Array<{ href: string; label: string; count: number }> = [];
  if (isAdmin) {
    if (adminCounts && match) {
      adminItems.push({ href: `/matches/${match.id}/availability`, label: "Guest requests", count: adminCounts.guestRequests });
      if (phase === "open") {
        adminItems.push({ href: `/matches/${match.id}/availability`, label: "No reply yet", count: match.noReplyCount });
      }
    }
    if (statsCounts) adminItems.push({ href: "/stats", label: "Stats to review", count: statsCounts.pending });
    if (adminCounts) {
      adminItems.push({ href: "/admin/accounts?tab=billing", label: "Payments to confirm", count: adminCounts.paymentsToConfirm });
      adminItems.push({ href: "/season?tab=multisport", label: "MultiSport scans", count: adminCounts.multisportPending });
    }
    if (playersAdmin) adminItems.push({ href: "/players", label: "Password resets", count: playersAdmin.resetRequests.length });
  }
  const adminOpen = adminItems.filter((a) => a.count > 0);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6">
      {playerId != null ? (
        <StoriesRow
          groups={stories}
          me={{ name: name ?? "", photoUrl: myPhoto }}
          canModerate={role === "admin" || role === "super"}
          match={match ? { id: match.id, label: matchLabel(match.playedOn) } : null}
        />
      ) : null}
      <section className="relative overflow-hidden rounded-3xl px-5 py-4 text-white shadow-sm">
        <Image
          src="/home-hero.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 896px) 100vw, 896px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/85 via-emerald-600/80 to-teal-900/90" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Hi, {name}</h1>
          {rankInfo?.ranked ? (
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur transition hover:bg-white/25"
            >
              <span className="tabular-nums">
                #<CountUp to={rankInfo.rank} from={rankDelta ? rankInfo.rank + rankDelta : undefined} />
              </span>
              <span className="text-white/70">of {rankInfo.total}</span>
              {rankDelta ? (
                <span className={`tabular-nums font-semibold ${rankDelta > 0 ? "text-lime-200" : "text-red-200"}`}>
                  {rankDelta > 0 ? `▲${rankDelta}` : `▼${-rankDelta}`}
                </span>
              ) : null}
              <span className="text-white/40">·</span>
              <span className="tabular-nums">{rankInfo.final.toFixed(1)}</span>
            </Link>
          ) : null}
        </div>
      </section>

      {match && phase ? (
        <NextMatchCard
          match={match}
          phase={phase}
          playerId={playerId ?? null}
          isSubscriber={playerId != null && subscriberIds.has(Number(playerId))}
          msToLock={lockEnabled ? msUntilLock(match.kickoffAt) : null}
          voteHref={voteObligation?.matchId === match.id ? `/matches/${match.id}/vote` : null}
        />
      ) : (
        <Card className="mt-4">
          <p className="text-sm text-neutral-500">No match scheduled yet.</p>
        </Card>
      )}

      {playerId != null ? (
        <section className="mt-5">
          <SectionTitle>To do</SectionTitle>
          {todos.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm dark:border-white/10 dark:bg-neutral-900">
              <span aria-hidden>✅</span> All set. Nothing waiting on you.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {todos.slice(0, 3).map((t) => (
                <li key={t.key}>
                  <Link
                    href={t.href}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm transition active:scale-[0.99] ${TODO_TONE[t.tone]}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{t.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{t.sub}</span>
                    </span>
                    <span aria-hidden className="text-lg">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {adminOpen.length > 0 ? (
        <section className="mt-5">
          <SectionTitle>Needs an admin</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            {adminOpen.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:border-amber-500/60 active:scale-[0.98] dark:bg-amber-950/30 dark:text-amber-200"
              >
                {a.label}
                <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold tabular-nums text-white">
                  {a.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(lastMatchday && lastMatchday.rounds > 0) || form.length > 0 ? (
        <section className="mt-5">
          <SectionTitle>Your last games</SectionTitle>
          <Card className="mt-2">
            {lastMatchday && lastMatchday.rounds > 0 ? (
              <Link href={`/matches/${lastMatchday.matchId}`} className="block">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{matchLabel(lastMatchday.playedOn)}</span>
                  <span className="text-xs text-neutral-400">{lastMatchday.rounds} mini-matches →</span>
                </div>
                <div className="mt-3">
                  <SegmentedBar
                    segments={[
                      { label: "Won", value: lastMatchday.won, barClass: "bg-emerald-500", dotClass: "bg-emerald-500" },
                      { label: "Drawn", value: lastMatchday.drawn, barClass: "bg-neutral-400", dotClass: "bg-neutral-400" },
                      { label: "Lost", value: lastMatchday.lost, barClass: "bg-red-500", dotClass: "bg-red-500" },
                    ]}
                  />
                </div>
              </Link>
            ) : null}
            {lastMatchday && lastMatchday.rounds > 0 ? (
              <Link
                href={`/matches/${lastMatchday.matchId}/recap`}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                ▶ Watch your recap
              </Link>
            ) : null}
            {form.length > 0 ? (
              <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3 dark:border-white/10">
                <span className="text-xs font-medium text-neutral-500">Form</span>
                <div className="flex gap-1">
                  {[...form].reverse().map((f) => (
                    <Link
                      key={f.matchId}
                      href={`/matches/${f.matchId}`}
                      title={f.result === "W" ? "Won" : f.result === "L" ? "Lost" : "Drew"}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${FORM_TONE[f.result]}`}
                    >
                      {f.result}
                    </Link>
                  ))}
                </div>
                <span className="ml-auto text-[11px] text-neutral-400">oldest → latest</span>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      <NotificationPrompt />
      <InstallPrompt />
    </main>
  );
}

const TODO_TONE: Record<Todo["tone"], string> = {
  emerald: "border-emerald-500/30 bg-emerald-50/70 text-emerald-950 hover:border-emerald-500/60 dark:bg-emerald-950/25 dark:text-emerald-100",
  amber: "border-amber-500/30 bg-amber-50/70 text-amber-950 hover:border-amber-500/60 dark:bg-amber-950/25 dark:text-amber-100",
  sky: "border-sky-500/30 bg-sky-50/70 text-sky-950 hover:border-sky-500/60 dark:bg-sky-950/25 dark:text-sky-100",
};

const FORM_TONE = { W: "bg-emerald-500", D: "bg-neutral-400", L: "bg-red-500" } as const;

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{children}</h2>
  );
}

function NextMatchCard({
  match,
  phase,
  playerId,
  isSubscriber,
  msToLock,
  voteHref,
}: {
  match: HomeMatch;
  phase: MatchPhase;
  playerId: number | null;
  isSubscriber: boolean;
  msToLock: number | null;
  voteHref: string | null;
}) {
  const full = match.squadCount >= match.maxPlayers;
  const title = phase === "done" ? "Last match" : phase === "matchday" ? "Matchday is live" : "Next match";
  const place = match.locationName.split(",")[0];

  return (
    <section className="mt-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/matches/${match.id}`} className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <SectionIcon name="matches" className="h-4 w-4" />
            {title}
          </p>
          <p className="mt-1 text-lg font-bold leading-tight">
            {fmtDate(match.playedOn)} · {fmtMatchTime(match.matchTime)}
          </p>
          {place ? <p className="truncate text-sm text-neutral-500">{place}</p> : null}
        </Link>
        {phase !== "done" ? (
          <Link
            href={`/matches/${match.id}/availability`}
            className="shrink-0 rounded-xl bg-neutral-100 px-2.5 py-1.5 text-center dark:bg-neutral-800"
          >
            <span className={`block text-lg font-bold tabular-nums leading-none ${full ? "text-amber-600" : ""}`}>
              {match.squadCount}/{match.maxPlayers}
            </span>
            <span className="text-[10px] font-medium uppercase text-neutral-500">{full ? "full" : "in"}</span>
          </Link>
        ) : null}
      </div>

      {phase !== "done" ? <KickoffCountdown kickoffAt={match.kickoffAt} /> : null}
      <PhaseStrip phase={phase} className="mt-3" />

      {playerId != null && (phase === "open" || phase === "locked") ? (
        <div className="mt-3">
          {match.waitlistPos != null && match.myStatus !== "in" ? (
            <p className="mb-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
              You&apos;re #{match.waitlistPos} on the waitlist.
            </p>
          ) : null}
          <AvailabilityControls
            matchId={match.id}
            currentStatus={match.myStatus}
            open={match.availabilityOpen}
            locked={phase === "locked"}
            msToLock={msToLock}
            isSubscriber={isSubscriber}
          />
        </div>
      ) : null}

      {(phase === "teams" || phase === "matchday") && match.myTeamNo != null ? (
        <Link
          href={`/matches/${match.id}`}
          className="mt-3 block rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30"
        >
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            You&apos;re on {match.myTeamName}
          </p>
          {match.teammates.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
              {match.teammates.map((t) => (
                <span key={t.playerId} className="inline-flex items-center gap-1.5 text-xs">
                  <Avatar name={t.name} photoUrl={t.photoUrl} size="xs" />
                  {t.name.split(" ")[0]}
                </span>
              ))}
            </div>
          ) : null}
        </Link>
      ) : (phase === "teams" || phase === "matchday") && playerId != null ? (
        <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
          You&apos;re not on a team sheet for this one.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "matchday" ? (
          <>
            <PrimaryLink href={`/matches/${match.id}/matchday`}>Open matchday</PrimaryLink>
            {voteHref ? <SecondaryLink href={voteHref}>Rate teammates</SecondaryLink> : null}
          </>
        ) : phase === "done" ? (
          <>
            <PrimaryLink href={`/matches/${match.id}`}>See results</PrimaryLink>
            <SecondaryLink href="/leaderboard">Leaderboard</SecondaryLink>
          </>
        ) : phase === "teams" ? (
          <SecondaryLink href={`/matches/${match.id}`}>See all teams</SecondaryLink>
        ) : (
          <SecondaryLink href={`/matches/${match.id}/availability`}>Who&apos;s playing</SecondaryLink>
        )}
      </div>
    </section>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-emerald-500/40 hover:text-emerald-700 active:scale-[0.97] dark:border-white/15 dark:text-neutral-200"
    >
      {children}
    </Link>
  );
}
