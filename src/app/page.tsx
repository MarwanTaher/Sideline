import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchList, fmtDate, fmtMatchTime } from "@/lib/matches";
import { getPlayerRank } from "@/lib/leaderboard";
import { getPlayerSeason } from "@/lib/player-trends";
import { getStatsReviewCounts } from "@/lib/stats";
import { getPlayersAdminData } from "@/lib/players-admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatBar } from "@/components/ui/stat-bar";
import { SegmentedBar } from "@/components/ui/segmented-bar";
import { BallIcon, BarsIcon, TrophyIcon } from "@/components/ui/icons";
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

  const season = playerId != null ? await getPlayerSeason(playerId) : null;
  const avgRating =
    season && season.ratingSeries.length > 0
      ? season.ratingSeries.reduce((s, p) => s + p.value, 0) / season.ratingSeries.length
      : (rankInfo?.final ?? 0);
  const wdl = season
    ? {
        W: season.form.filter((r) => r === "W").length,
        D: season.form.filter((r) => r === "D").length,
        L: season.form.filter((r) => r === "L").length,
      }
    : null;

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
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-700/90 via-emerald-800/85 to-emerald-950/90" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium capitalize backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            {isAdmin ? role : "Player"}
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Welcome back, {name}</h1>
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
              <p className="mt-2 text-lg font-semibold">Match {nextMatch.id}</p>
              <p className="mt-0.5 text-sm text-neutral-500">
                {fmtDate(nextMatch.playedOn)} at{" "}
                {fmtMatchTime(nextMatch.matchTime)} · {nextMatch.playerCount}{" "}
                players
              </p>
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

      {season && season.appearances > 0 ? (
        <Card className="mt-4">
          <h2 className="text-sm font-semibold text-neutral-500">Season performance</h2>
          <div className="mt-3 space-y-2.5">
            <StatBar label="Matches" value={season.appearances} max={Math.max(matches.length, season.appearances, 1)} colorClass="bg-emerald-500" />
            <StatBar label="Goals" value={season.goals} max={Math.max(season.appearances, season.goals, 1)} colorClass="bg-emerald-500" />
            <StatBar label="Assists" value={season.assists} max={Math.max(season.appearances, season.assists, 1)} colorClass="bg-sky-500" />
            <StatBar label="Avg" value={avgRating} max={10} display={avgRating.toFixed(1)} colorClass="bg-amber-500" />
          </div>
        </Card>
      ) : null}

      {wdl && wdl.W + wdl.D + wdl.L > 0 ? (
        <Card className="mt-4">
          <h2 className="text-sm font-semibold text-neutral-500">Recent form</h2>
          <div className="mt-3">
            <SegmentedBar
              segments={[
                { label: "Won", value: wdl.W, barClass: "bg-emerald-500", dotClass: "bg-emerald-500" },
                { label: "Drawn", value: wdl.D, barClass: "bg-neutral-400", dotClass: "bg-neutral-400" },
                { label: "Lost", value: wdl.L, barClass: "bg-red-500", dotClass: "bg-red-500" },
              ]}
            />
          </div>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link href="/matches" className="block">
          <Card className="h-full transition hover:shadow-md">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <BallIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-3 font-semibold">Matches</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Browse matches, teams, and approved stats.
            </p>
          </Card>
        </Link>
        <Link href="/leaderboard" className="block">
          <Card className="h-full transition hover:shadow-md">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
              <BarsIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-3 font-semibold">Leaderboard</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Rankings with the peer/stat blend.
            </p>
          </Card>
        </Link>
        <Link href="/awards" className="block">
          <Card className="h-full transition hover:shadow-md">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <TrophyIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-3 font-semibold">Awards</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Top scorer, defender, MOTM, and your badges.
            </p>
          </Card>
        </Link>
      </div>
    </main>
  );
}
