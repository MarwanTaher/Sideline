import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { getPlayerContact } from "@/lib/player-profile";
import { getPlayerSeason } from "@/lib/player-trends";
import { getPlayerRank } from "@/lib/leaderboard";
import { getPlayerAchievementsLive } from "@/lib/achievements";
import {
  getAwardsSettings,
  getPlayerBadgeCounts,
  getPlayerAwardHistory,
} from "@/lib/awards";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import BadgeGallery from "@/components/badge-gallery";
import AchievementsGrid from "@/app/profile/achievements-grid";

export const metadata = {
  title: "Player · Sideline",
};

// Badges/awards are recomputed from live data on every request.
export const dynamic = "force-dynamic";

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="font-heading text-3xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-neutral-400">{sub}</div> : null}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default async function PublicPlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const pid = Number(id);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  const contact = await getPlayerContact(pid);
  if (!contact) {
    notFound();
  }

  const settings = await getAwardsSettings();
  const thresholds = {
    minMatchVotes: settings.matchMinValidVotes,
    minOverallVotes: settings.overallMinValidVotes,
  };

  const [season, rankInfo, achievements, badgeCounts, history] = await Promise.all([
    getPlayerSeason(pid),
    getPlayerRank(pid),
    getPlayerAchievementsLive(pid),
    getPlayerBadgeCounts(pid, thresholds),
    getPlayerAwardHistory(pid, {
      recentMatchLimit: 8,
      minMatchVotes: thresholds.minMatchVotes,
      minOverallVotes: thresholds.minOverallVotes,
    }),
  ]);

  const standingLabel = rankInfo?.ranked
    ? `#${rankInfo.rank} · Top ${Math.ceil((rankInfo.rank / rankInfo.total) * 100)}%`
    : "Unranked";
  const lastMatch = season.lastMatch;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      {/* Identity */}
      <Card accent="#059669">
        <div className="flex items-center gap-4">
          <Avatar name={contact.name} photoUrl={contact.photoUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight font-heading">
              {contact.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {contact.preferredPosition ? (
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {contact.preferredPosition}
                </span>
              ) : null}
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                {standingLabel}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Season totals */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatTile label="Matches" value={season.appearances} />
        <StatTile label="Goals" value={season.goals} />
        <StatTile label="Assists" value={season.assists} />
      </div>

      {/* Last match */}
      <div className="mt-3">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Last match
            </span>
            {lastMatch ? (
              <span className="text-sm font-semibold">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {lastMatch.goals}
                </span>{" "}
                <span className="text-neutral-400">G</span>
                <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">·</span>
                <span className="text-sky-600 dark:text-sky-400">{lastMatch.assists}</span>{" "}
                <span className="text-neutral-400">A</span>
              </span>
            ) : (
              <span className="text-sm text-neutral-400">No matches yet</span>
            )}
          </div>
        </Card>
      </div>

      {/* Achievements */}
      <div className="mt-5">
        <SectionCard title="Achievements">
          <AchievementsGrid
            earned={achievements}
            progress={{ appearances: season.appearances, goals: season.goals }}
          />
        </SectionCard>
      </div>

      {/* Badges + award history */}
      <div className="mt-5">
        <SectionCard title="Badges & awards">
          <BadgeGallery counts={badgeCounts} />

          <div className="my-5 h-px bg-black/5 dark:bg-white/10" />

          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Awards history
          </h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No awards yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
              {history.map((h, i) => (
                <li
                  key={`${h.scope}-${h.award_type}-${i}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="font-medium">{h.award_label}</span>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-neutral-400">
                    {h.scope}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
