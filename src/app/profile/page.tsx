import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import {
  getAwardsSettings,
  getPlayerBadgeCounts,
  getPlayerAwardHistory,
} from "@/lib/awards";
import BadgeGallery from "@/components/badge-gallery";
import { Avatar } from "@/components/ui/avatar";
import ChangePassword from "./change-password";
import ProfileDetails from "./profile-details";
import NotificationsToggle from "./notifications-toggle";
import NotificationPreferences from "./notification-preferences";
import YourSeason from "./your-season";
import AchievementsGrid from "./achievements-grid";
import ChemistryPanel from "./chemistry-panel";
import { getPlayerContact } from "@/lib/player-profile";
import { getPlayerSeason } from "@/lib/player-trends";
import { getPlayerRank } from "@/lib/leaderboard";
import { getPlayerAchievementsLive } from "@/lib/achievements";
import { getChemistry } from "@/lib/chemistry";
import { getKudos } from "@/lib/kudos";
import { getFunMessages } from "@/lib/moments";
import { FunMessagesToggle } from "./fun-messages-toggle";
import { SillySoundsToggle } from "./silly-sounds-toggle";

export const metadata = {
  title: "Profile · Sideline",
};

// Awards/badges are recomputed from live data on every request (no caching).
export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const playerId = session.user.playerId;
  if (playerId == null) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-3 rounded-lg bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:bg-neutral-900">
          Award history and badges are only available for player accounts.
        </p>
      </main>
    );
  }

  const pid = Number(playerId);
  const settings = await getAwardsSettings();
  const thresholds = {
    minMatchVotes: settings.matchMinValidVotes,
    minOverallVotes: settings.overallMinValidVotes,
  };

  const [contact, badgeCounts, history] = await Promise.all([
    getPlayerContact(pid),
    getPlayerBadgeCounts(pid, thresholds),
    getPlayerAwardHistory(pid, {
      recentMatchLimit: 8,
      minMatchVotes: thresholds.minMatchVotes,
      minOverallVotes: thresholds.minOverallVotes,
    }),
  ]);

  const [season, achievements, chemistry, kudos, funMessages] = await Promise.all([
    getPlayerSeason(pid),
    getPlayerAchievementsLive(pid),
    getChemistry(pid, { minShared: 3 }),
    getKudos(pid, pid),
    getFunMessages(pid),
  ]);

  const displayName = contact?.name ?? session.user.name ?? "Player";
  const rankInfo = await getPlayerRank(pid);
  const standingLabel = rankInfo?.ranked
    ? `Ranked #${rankInfo.rank} · Top ${Math.ceil((rankInfo.rank / rankInfo.total) * 100)}%`
    : "Unranked";
  const roleLabel =
    session.user.role && session.user.role !== "player" ? session.user.role : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-6 space-y-5">
        {/* Identity + contact */}
        <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <ProfileDetails
            name={displayName}
            position={contact?.preferredPosition ?? null}
            email={contact?.email ?? null}
            phone={contact?.phone ?? null}
            photoUrl={contact?.photoUrl ?? null}
            standingLabel={standingLabel}
            roleLabel={roleLabel}
          />
        </section>
        {!rankInfo?.ranked ? (
          <section
            aria-labelledby="rank-progress-title"
            className="rounded-2xl border border-emerald-700/20 bg-emerald-50/60 p-4 dark:border-emerald-300/20 dark:bg-emerald-950/20"
          >
            <h2 id="rank-progress-title" className="text-sm font-semibold">
              Your rank is in progress
            </h2>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
              Play a few matches to build your record and appear in the leaderboard.
            </p>
            <Link
              href="/matches"
              className="mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
            >
              Find a match
            </Link>
          </section>
        ) : null}

        {/* Your season: form, trends, highlights */}
        <Card title="Your season">
          <YourSeason season={season} />
        </Card>

        {/* Kudos received from teammates */}
        <Card title={`Kudos received (${kudos.count})`}>
          {kudos.givers.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No kudos yet — teammates can give you kudos from your profile.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {kudos.givers.map((g) => (
                <li key={g.playerId}>
                  <Link
                    href={`/players/${g.playerId}`}
                    title={g.name}
                    className="flex flex-col items-center gap-1 transition hover:opacity-80"
                  >
                    <Avatar name={g.name} photoUrl={g.photoUrl} size="md" />
                    <span className="max-w-[64px] truncate text-[11px] text-neutral-500">
                      {g.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Badges you can earn */}
        <Card title="Badges">
          <AchievementsGrid
            earned={achievements}
            progress={{ appearances: season.appearances, goals: season.goals }}
          />
        </Card>

        {/* Chemistry & head-to-head */}
        <Card title="Chemistry & head-to-head">
          <ChemistryPanel report={chemistry} />
        </Card>

        {/* Achievements: badges + awards */}
        <Card title="Achievements">
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
                  <span className="font-medium">
                    {h.award_label}
                    {h.source === "override" ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        override
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-neutral-400">
                    {h.scope}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Settings: notifications + account */}
        <Card title="Settings">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Notifications
          </h3>
          <div className="mt-2">
            <NotificationsToggle />
            <NotificationPreferences playerId={pid} />
            <FunMessagesToggle initial={funMessages} />
            <SillySoundsToggle />
          </div>

          <div className="my-5 h-px bg-black/5 dark:bg-white/10" />

          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Account
          </h3>
          <div className="mt-2">
            <ChangePassword />
          </div>
        </Card>
      </div>
    </main>
  );
}
