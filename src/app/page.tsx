import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchList, fmtDate, fmtMatchTime } from "@/lib/matches";
import { getLeaderboard } from "@/lib/leaderboard";
import { getStatsReviewCounts } from "@/lib/stats";
import { getPlayersAdminData } from "@/lib/players-admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionIcon } from "@/components/section-icon";

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
    const lb = await getLeaderboard();
    const idx = lb.rows.findIndex((r) => r.id === playerId);
    if (idx >= 0) {
      rankInfo = {
        rank: idx + 1,
        total: lb.rows.length,
        final: lb.rows[idx].final,
        ranked: lb.rows[idx].ranked,
      };
    }
  }

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
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name}</h1>
      <p className="mt-1 text-sm capitalize text-neutral-500">
          {isAdmin ? role : "Player"}
      </p>

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
            </Card>
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link href="/matches" className="block">
          <Card className="h-full transition hover:shadow-md">
            <SectionIcon name="matches" className="h-10 w-10" />
            <h2 className="mt-3 font-semibold">Matches</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Browse matches, teams, and approved stats.
            </p>
          </Card>
        </Link>
        <Link href="/leaderboard" className="block">
          <Card className="h-full transition hover:shadow-md">
            <SectionIcon name="leaderboard" className="h-10 w-10" />
            <h2 className="mt-3 font-semibold">Leaderboard</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Rankings with the peer/stat blend.
            </p>
          </Card>
        </Link>
        <Link href="/awards" className="block">
          <Card className="h-full transition hover:shadow-md">
            <SectionIcon name="awards" className="h-10 w-10" />
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
