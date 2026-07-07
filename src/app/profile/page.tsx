import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sqlClient } from "@/lib/db";
import {
  getAwardsSettings,
  getPlayerBadgeCounts,
  getPlayerAwardHistory,
} from "@/lib/awards";
import BadgeGallery from "@/components/badge-gallery";
import ChangePassword from "./change-password";
import NotificationsToggle from "./notifications-toggle";
import NotificationPreferences from "./notification-preferences";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Profile · Sideline",
};

// Awards/badges are recomputed from live data on every request (no caching).
export const dynamic = "force-dynamic";

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

  const [playerRowsRaw, badgeCounts, history] = await Promise.all([
    sqlClient.query("SELECT name, preferred_position FROM players WHERE id = $1", [pid]),
    getPlayerBadgeCounts(pid, thresholds),
    getPlayerAwardHistory(pid, {
      recentMatchLimit: 8,
      minMatchVotes: thresholds.minMatchVotes,
      minOverallVotes: thresholds.minOverallVotes,
    }),
  ]);

  const playerRows = playerRowsRaw as Array<{ name: string; preferred_position: string }>;
  const player = playerRows[0];
  const displayName = player?.name ?? session.user.name ?? "Player";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="profile" className="h-9 w-9" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          {player?.preferred_position ? (
            <p className="mt-1 text-sm text-neutral-500">{player.preferred_position}</p>
          ) : null}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Badge collection</h2>
        <div className="mt-2">
          <BadgeGallery counts={badgeCounts} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Awards history</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No awards yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Award</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr
                    key={`${h.scope}-${h.award_type}-${i}`}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="px-4 py-2">{h.scope}</td>
                    <td className="px-4 py-2 font-medium">
                      {h.award_label}
                      {h.source === "override" ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          override
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Notifications</h2>
        <div className="mt-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <NotificationsToggle />
          <NotificationPreferences playerId={pid} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Account</h2>
        <div className="mt-3">
          <ChangePassword />
        </div>
      </section>
    </main>
  );
}
