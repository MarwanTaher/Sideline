import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchList, fmtDate, fmtMatchTime } from "@/lib/matches";
import { matchLabel } from "@/lib/format";
import KickoffCountdown from "@/components/kickoff-countdown";
import {
  getActiveSubscriptionSeason,
  getSubscription,
  countActiveSubscribers,
} from "@/lib/season-subscriptions";
import { getPlayerRank } from "@/lib/leaderboard";
import { getPendingVoteObligation } from "@/lib/voting";
import { getLastMatchdayOutcome } from "@/lib/matchday";
import { getStatsReviewCounts } from "@/lib/stats";
import { getPlayersAdminData } from "@/lib/players-admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedBar } from "@/components/ui/segmented-bar";
import { SectionIcon } from "@/components/section-icon";
import NotificationPrompt from "@/components/notification-prompt";
import InstallPrompt from "@/components/install-prompt";

export const dynamic = "force-dynamic";

const MATCHDAY_TONE = {
  draft: "warning",
  active: "success",
  closed: "neutral",
} as const;

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { name, role, playerId } = session.user;
  const isAdmin = await isAdminView(role === "admin" || role === "super");

  const matches = await getMatchList(isAdmin ? undefined : playerId ?? -1);
  const nextMatch =
    matches.find((m) => m.matchdayStatus === "active") ?? matches[0] ?? null;

  let rankInfo: {
    rank: number;
    total: number;
    final: number;
    ranked: boolean;
  } | null = null;
  if (playerId != null) {
    rankInfo = await getPlayerRank(playerId);
  }

  const voteObligation = playerId != null ? await getPendingVoteObligation(playerId) : null;
  const lastMatchday = playerId != null ? await getLastMatchdayOutcome(playerId) : null;

  // Nudge towards a season place only while one is actually available.
  const seasonSubscription = await getActiveSubscriptionSeason();
  const mySubscription =
    seasonSubscription && playerId != null
      ? await getSubscription(seasonSubscription.id, playerId)
      : null;
  const seasonSpotsLeft = seasonSubscription
    ? seasonSubscription.subscriberCap - (await countActiveSubscribers(seasonSubscription.id))
    : 0;
  const showSeasonPrompt =
    seasonSubscription != null &&
    seasonSubscription.signupOpen &&
    mySubscription?.status !== "active" &&
    seasonSpotsLeft > 0 &&
    playerId != null;

  let adminInfo: { pendingReviews: number; resetRequests: number } | null = null;
  if (isAdmin) {
    const [rc, pdata] = await Promise.all([
      getStatsReviewCounts(),
      getPlayersAdminData(),
    ]);
    adminInfo = {
      pendingReviews: rc.pending,
      resetRequests: pdata.resetRequests.length,
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-sm">
        <Image
          src="/home-hero.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 896px) 100vw, 896px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/85 via-emerald-600/80 to-teal-900/90" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_100%_0%,rgba(163,230,53,0.35),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_0%_100%,rgba(45,212,191,0.30),transparent_55%)]" />
        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back, {name}</h1>
          {rankInfo?.ranked ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
              <span className="tabular-nums">#{rankInfo.rank}</span>
              <span className="text-white/70">of {rankInfo.total}</span>
              <span className="text-white/40">·</span>
              <span className="tabular-nums">Score {rankInfo.final.toFixed(1)}</span>
            </p>
          ) : null}
        </div>
      </section>

      <NotificationPrompt />
      <InstallPrompt />

      {showSeasonPrompt ? (
        <Link href="/season" className="mt-4 block">
          <Card accent="#0ea5e9" className="flex items-center justify-between gap-3 bg-sky-50/60 dark:bg-sky-950/20">
            <div className="flex items-center gap-3">
              <SectionIcon name="matches" className="h-8 w-8" />
              <div>
                <p className="text-sm font-semibold">
                  {seasonSubscription!.name} — {seasonSpotsLeft} place
                  {seasonSpotsLeft === 1 ? "" : "s"} left
                </p>
                <p className="text-sm text-neutral-500">
                  Commit for the season and you&apos;re IN for every match
                  automatically.
                </p>
              </div>
            </div>
            <span aria-hidden className="text-lg text-sky-600 dark:text-sky-400">
              &rarr;
            </span>
          </Card>
        </Link>
      ) : null}

      {voteObligation ? (
        <Link href={`/matches/${voteObligation.matchId}/vote`} className="mt-4 block">
          <Card accent="#059669" className="flex items-center justify-between gap-3 bg-emerald-50/60 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <SectionIcon name="votes" className="h-8 w-8" />
              <div>
                <p className="text-sm font-semibold">Rate {matchLabel(voteObligation.playedOn)}</p>
                <p className="text-sm text-neutral-500">
                  Voting is open — rate how your teammates played.
                </p>
              </div>
            </div>
            <span aria-hidden className="text-lg text-emerald-600 dark:text-emerald-400">
              &rarr;
            </span>
          </Card>
        </Link>
      ) : null}

      {playerId != null &&
      nextMatch &&
      nextMatch.availabilityOpen ? (
        <Link
          href={`/matches/${nextMatch.id}/availability`}
          className="mt-6 block"
        >
          <Card accent="#059669" className="flex items-center justify-between gap-3 bg-emerald-50/60 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <SectionIcon name="availability" className="h-8 w-8" />
              <div>
                <p className="text-sm font-semibold">Set your availability</p>
                <p className="text-sm text-neutral-500">
                  Mark yourself in or out for {fmtDate(nextMatch.playedOn)} at{" "}
                  {fmtMatchTime(nextMatch.matchTime)}.
                </p>
              </div>
            </div>
            <span aria-hidden className="text-lg text-emerald-600 dark:text-emerald-400">
              &rarr;
            </span>
          </Card>
        </Link>
      ) : playerId != null &&
        nextMatch &&
        nextMatch.matchdayStatus === "closed" ? (
        <Link href="/leaderboard" className="mt-6 block">
          <Card accent="#6366f1" className="flex items-center justify-between gap-3 bg-indigo-50/60 dark:bg-indigo-950/20">
            <div className="flex items-center gap-3">
              <SectionIcon name="leaderboard" className="h-8 w-8" />
              <div>
                <p className="text-sm font-semibold">Results are in</p>
                <p className="text-sm text-neutral-500">
                  Ratings for {fmtDate(nextMatch.playedOn)} are final — see where
                  you landed.
                </p>
              </div>
            </div>
            <span aria-hidden className="text-lg text-indigo-600 dark:text-indigo-400">
              &rarr;
            </span>
          </Card>
        </Link>
      ) : null}

      {adminInfo &&
      (adminInfo.pendingReviews > 0 || adminInfo.resetRequests > 0) ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {adminInfo.pendingReviews > 0 ? (
            <Link href="/stats" className="block">
              <Card className="flex items-center justify-between transition hover:border-black/20 dark:hover:border-white/20">
                <span className="text-sm font-medium">
                  Stat submissions to review
                </span>
                <Badge tone="warning" dot>
                  {adminInfo.pendingReviews} pending
                </Badge>
              </Card>
            </Link>
          ) : null}
          {adminInfo.resetRequests > 0 ? (
            <Link href="/players" className="block">
              <Card className="flex items-center justify-between transition hover:border-black/20 dark:hover:border-white/20">
                <span className="text-sm font-medium">
                  Password reset requests
                </span>
                <Badge tone="warning" dot>
                  {adminInfo.resetRequests} pending
                </Badge>
              </Card>
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {nextMatch ? (
          <Link href={`/matches/${nextMatch.id}`} className="block">
            <Card className="h-full transition hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-500">
                  <SectionIcon name="matches" className="h-5 w-5" />
                  {nextMatch.matchdayStatus === "active"
                    ? "Current match"
                    : "Latest match"}
                </h2>
                <Badge tone={MATCHDAY_TONE[nextMatch.matchdayStatus]} dot>
                  {nextMatch.matchdayStatus}
                </Badge>
              </div>
              <p className="mt-2 text-lg font-semibold">{matchLabel(nextMatch.playedOn)}</p>
              <p className="mt-0.5 text-sm text-neutral-500">
                {fmtDate(nextMatch.playedOn)} at{" "}
                {fmtMatchTime(nextMatch.matchTime)} · {nextMatch.playerCount}{" "}
                players
              </p>
              <KickoffCountdown kickoffAt={nextMatch.kickoffAt} />
            </Card>
          </Link>
        ) : null}

        {rankInfo ? (
          <Link href="/leaderboard" className="block">
            <Card className="h-full transition hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-500">
                  <SectionIcon name="leaderboard" className="h-5 w-5" />
                  Your standing
                </h2>
                <Badge tone={rankInfo.ranked ? "success" : "neutral"} dot>
                  {rankInfo.ranked ? "Ranked" : "Unranked"}
                </Badge>
              </div>
              <p className="mt-2 text-lg font-semibold tabular-nums">
                #{rankInfo.rank}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  of {rankInfo.total}
                </span>
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-neutral-500">
                Score {rankInfo.final.toFixed(1)}
                {rankInfo.ranked && rankInfo.total > 0 ? (
                  <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                    Top {Math.ceil((rankInfo.rank / rankInfo.total) * 100)}%
                  </span>
                ) : null}
              </p>
              {rankInfo.ranked && rankInfo.total > 0 ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(4, ((rankInfo.total - rankInfo.rank + 1) / rankInfo.total) * 100)}%` }}
                  />
                </div>
              ) : null}
            </Card>
          </Link>
        ) : null}
      </div>

      {lastMatchday && lastMatchday.rounds > 0 ? (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-500">
              Last matchday · {matchLabel(lastMatchday.playedOn)}
            </h2>
            <span className="text-xs text-neutral-400">{lastMatchday.rounds} mini-matches</span>
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
        </Card>
      ) : null}
    </main>
  );
}
