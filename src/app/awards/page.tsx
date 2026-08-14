import { Suspense } from "react";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import {
  getAwards,
  getAwardsSettings,
  getAwardMatches,
  getPlayerBadgeCounts,
  getActivePlayers,
  AWARD_TYPES,
} from "@/lib/awards";
import AwardsControls from "./awards-controls";
import AdminOverridePanel, { type OverrideItem } from "./admin-override";
import BadgeGallery from "@/components/badge-gallery";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon } from "@/components/section-icon";
import { Badge } from "@/components/ui/badge";
import { TrophyIcon } from "@/components/ui/icons";
import { DataTable } from "@/components/ui/data-table";

export const metadata = {
  title: "Awards · Sideline",
};

// Awards are recomputed from live data on every request (no caching).
export const dynamic = "force-dynamic";

interface Thresholds {
  minMatchVotes: number;
  minOverallVotes: number;
}

/** Mirror Streamlit _render_awards_scope metric text formatting. */
function metricText(metricLabel: string, values: (number | null)[]): string {
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  if (present.length === 0) return "—";
  const top = Math.max(...present);
  return metricLabel.toLowerCase() === "peer avg"
    ? `${metricLabel}: ${top.toFixed(2)}`
    : `${metricLabel}: ${Math.trunc(top)}`;
}

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; match?: string }>;
}) {
  const sp = await searchParams;
  const scope: "match" | "overall" = sp.scope === "match" ? "match" : "overall";

  const [settings, matches, session] = await Promise.all([
    getAwardsSettings(),
    getAwardMatches(),
    auth(),
  ]);

  let matchId: number | null = null;
  if (scope === "match") {
    const requested = sp.match ? Number(sp.match) : NaN;
    matchId = Number.isFinite(requested)
      ? requested
      : matches.length > 0
        ? matches[0].id
        : null;
  }

  const thresholds: Thresholds = {
    minMatchVotes: settings.matchMinValidVotes,
    minOverallVotes: settings.overallMinValidVotes,
  };

  const playerId = session?.user?.playerId ?? null;
  const role = session?.user?.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <SubNav
        className="mb-6"
        ariaLabel="Standings"
        items={[
          { href: "/leaderboard", label: "Leaderboard" },
          { href: "/awards", label: "Awards" },
        ]}
      />
      <div className="flex items-center gap-3">
        <SectionIcon name="awards" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Awards</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Automatic awards computed from goals, assists, and peer ratings.
      </p>

      <AwardsControls scope={scope} matchId={matchId} matches={matches} />

      <p className="mt-3 text-xs text-neutral-500">
        Thresholds: match min valid votes = {settings.matchMinValidVotes}, overall min valid
        votes = {settings.overallMinValidVotes}
      </p>

      {/* Scope-dependent results stream in independently; the keyed boundary
          shows a skeleton the instant the scope/match toggle changes so the
          page never feels frozen while the heavier query runs. */}
      <Suspense
        key={`results-${scope}-${matchId ?? "none"}`}
        fallback={<ResultsSkeleton isAdmin={isAdmin} />}
      >
        <AwardsResults
          scope={scope}
          matchId={matchId}
          thresholds={thresholds}
          isAdmin={isAdmin}
          noMatches={scope === "match" && matches.length === 0}
        />
      </Suspense>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Badge gallery</h2>
        <div className="mt-2">
          {/* Badge counts are scope-independent and by far the heaviest query,
              so they stream in on their own and never block the table above. */}
          <Suspense fallback={<BadgeSkeleton />}>
            <BadgeSection playerId={playerId} thresholds={thresholds} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function AwardsResults({
  scope,
  matchId,
  thresholds,
  isAdmin,
  noMatches,
}: {
  scope: "match" | "overall";
  matchId: number | null;
  thresholds: Thresholds;
  isAdmin: boolean;
  noMatches: boolean;
}) {
  if (noMatches) {
    return (
      <p className="mt-6 rounded-lg bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500 dark:bg-neutral-900">
        No matches available yet.
      </p>
    );
  }

  const payload =
    scope === "overall" || matchId !== null
      ? await getAwards(scope, matchId, thresholds)
      : null;

  const activePlayers = isAdmin && payload ? await getActivePlayers() : [];
  const overrideItems: OverrideItem[] =
    isAdmin && payload
      ? AWARD_TYPES.map((awardType) => {
          const block = payload.awards[awardType];
          return {
            awardType,
            label: block.award_label,
            currentWinnerIds: block.winners.map((w) => Number(w.player_id)),
            isOverride: block.source === "override",
          };
        })
      : [];

  return (
    <>
      <DataTable className="mt-4 rounded-2xl border border-black/[0.06] shadow-sm dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Award</th>
              <th scope="col" className="px-4 py-2 font-medium">Winner(s)</th>
              <th scope="col" className="px-4 py-2 font-medium">Metric</th>
              {isAdmin ? (
                <th scope="col" className="px-4 py-2 font-medium">Source</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {payload &&
              AWARD_TYPES.map((awardType) => {
                const block = payload.awards[awardType];
                const winners = block.winners ?? [];
                const names =
                  winners.length > 0
                    ? winners.map((w) => w.name).join(", ")
                    : "—";
                const metric = metricText(
                  block.metric_label,
                  winners.map((w) => w.metric_value),
                );
                return (
                  <tr
                    key={awardType}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                          <TrophyIcon className="h-3.5 w-3.5" />
                        </span>
                        {block.award_label}
                      </span>
                    </td>
                    <td className="px-4 py-2">{names}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">
                      {metric}
                    </td>
                    {isAdmin ? (
                      <td className="px-4 py-2">
                        {block.source === "override" ? (
                          <Badge tone="warning" dot>
                            override
                          </Badge>
                        ) : (
                          <span className="text-xs text-neutral-400">computed</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </DataTable>

      {isAdmin && payload ? (
        <AdminOverridePanel
          items={overrideItems}
          scope={scope}
          matchId={matchId}
          players={activePlayers}
        />
      ) : null}
    </>
  );
}

async function BadgeSection({
  playerId,
  thresholds,
}: {
  playerId: number | null;
  thresholds: Thresholds;
}) {
  const badgeCounts = playerId
    ? await getPlayerBadgeCounts(Number(playerId), thresholds)
    : null;
  return <BadgeGallery counts={badgeCounts} />;
}

function ResultsSkeleton({ isAdmin }: { isAdmin: boolean }) {
  const cols = isAdmin ? 4 : 3;
  return (
    <div
      className="mt-4 animate-pulse rounded-xl border border-black/10 dark:border-white/10"
      aria-hidden="true"
    >
      <div className="h-9 rounded-t-xl bg-neutral-100 dark:bg-neutral-900" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 border-t border-black/5 px-4 py-3 dark:border-white/5"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 flex-1 rounded bg-neutral-200/70 dark:bg-neutral-800"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BadgeSkeleton() {
  return (
    <div className="flex flex-wrap gap-4" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-20 w-20 animate-pulse rounded-xl bg-neutral-200/70 dark:bg-neutral-800"
        />
      ))}
    </div>
  );
}
