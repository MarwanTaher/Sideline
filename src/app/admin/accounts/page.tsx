import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getTabLocksByAdmin, getPlayerAdminStatuses } from "@/lib/admins";
import type { AdminTabKey } from "@/lib/admin-tabs";
import { listSeasons } from "@/lib/seasons";
import {
  getActiveSubscriptionSeason,
  listSeasonWaitlist,
  listSubscribers,
} from "@/lib/season-subscriptions";
import { getActivePlayers } from "@/lib/awards";
import { getSeasonGoLiveChecklist } from "@/lib/season-billing";
import PlayerAdmins from "./player-admins";
import SeasonsAdmin from "./seasons-admin";
import SubscriptionAdmin from "./subscription-admin";
import MessagesAdmin from "./messages-admin";
import { getMomentCopy } from "@/lib/moment-copy-settings";
import { getTapSpamConfig } from "@/lib/tap-spam-settings";
import { getMomentSoundConfig } from "@/lib/moment-sound-settings";
import AdminTabsMobile from "./admin-tabs-mobile";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionRail } from "@/components/ui/section-rail";

export const metadata = {
  title: "Admin control · Sideline",
};

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isAdminView(session.user.role === "super"))) redirect("/leaderboard");

  const { tab } = await searchParams;
  // Billing now lives on the one admin Payments page.
  if (tab === "billing") redirect("/admin/payments?tab=billing");
  const activeTab =
    tab === "seasons" || tab === "messages" || tab === "other"
      ? tab
      : "admins";

  // Only the active tab's data is loaded; this page was fetching everything.
  const [playerAdmins, tabLocks, momentCopy, tapSpam, momentSounds] = await Promise.all([
    activeTab === "admins" ? getPlayerAdminStatuses() : Promise.resolve([]),
    activeTab === "admins" ? getTabLocksByAdmin() : Promise.resolve(new Map()),
    activeTab === "messages" ? getMomentCopy() : Promise.resolve({}),
    activeTab === "messages" ? getTapSpamConfig() : Promise.resolve({ enabled: true, sounds: [] }),
    activeTab === "messages"
      ? getMomentSoundConfig()
      : Promise.resolve({ celebration: [], bummer: [] }),
  ]);

  const needsSeason = activeTab === "seasons";
  const subscriptionSeason = needsSeason ? await getActiveSubscriptionSeason() : null;

  const [seasons, subscribers, activePlayers, seasonWaitlist, goLiveChecklist] = await Promise.all([
    activeTab === "seasons" ? listSeasons() : Promise.resolve([]),
    activeTab === "seasons" && subscriptionSeason
      ? listSubscribers(subscriptionSeason.id)
      : Promise.resolve([]),
    activeTab === "seasons" && subscriptionSeason
      ? getActivePlayers()
      : Promise.resolve([]),
    activeTab === "seasons" && subscriptionSeason
      ? listSeasonWaitlist(subscriptionSeason.id)
      : Promise.resolve([]),
    activeTab === "seasons" && subscriptionSeason
      ? getSeasonGoLiveChecklist(subscriptionSeason.id)
      : Promise.resolve(null),
  ]);

  const subscribed = new Set(subscribers.map((s) => s.playerId));
  const candidates = activePlayers
    .filter((p) => !subscribed.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  const lockedByAdmin: Record<number, AdminTabKey[]> = {};
  for (const [adminId, keys] of tabLocks) lockedByAdmin[adminId] = keys;

  const sectionItems = [
    { href: "/admin/accounts", label: "Admins" },
    { href: "/admin/accounts?tab=seasons", label: "Seasons" },
    { href: "/admin/payments", label: "Payments" },
    { href: "/admin/accounts?tab=messages", label: "Messages" },
    { href: "/admin/accounts?tab=other", label: "Other" },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin control</h1>

      <SubNav
        className="mt-4 hidden md:block lg:hidden"
        ariaLabel="Admin sections"
        items={sectionItems}
        activeHref={
          activeTab === "admins" ? "/admin/accounts" : `/admin/accounts?tab=${activeTab}`
        }
      />
      <SectionRail
        ariaLabel="Admin sections"
        heading="Admin"
        items={sectionItems}
        activeHref={
          activeTab === "admins" ? "/admin/accounts" : `/admin/accounts?tab=${activeTab}`
        }
      />
      <Suspense fallback={null}>
        <AdminTabsMobile />
      </Suspense>

      {activeTab === "admins" ? (
        <>
          <p className="mt-4 text-sm text-neutral-500">
            Promote a player to admin or remove their access, and control which
            sections each admin can use.
          </p>
          <PlayerAdmins players={playerAdmins} lockedByAdmin={lockedByAdmin} />
        </>
      ) : null}

      {activeTab === "seasons" ? (
        <>
          <SeasonsAdmin seasons={seasons} />
          {subscriptionSeason ? (
            <SubscriptionAdmin
              season={subscriptionSeason}
              subscribers={subscribers}
              candidates={candidates}
              waitlist={seasonWaitlist}
              goLiveChecklist={goLiveChecklist}
            />
          ) : null}
        </>
      ) : null}

      {activeTab === "messages" ? (
        <MessagesAdmin
          overrides={momentCopy}
          name={session.user.name ?? ""}
          tapSpam={tapSpam}
          momentSounds={momentSounds}
        />
      ) : null}

      {activeTab === "other" ? (
        <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold">Diagnostics</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Low-level database and scoring checks. Kept out of the admin menu to
            keep it short.
          </p>
          <Link
            href="/diagnostics"
            className="mt-3 inline-flex rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800"
          >
            Open diagnostics
          </Link>
        </section>
      ) : null}
    </main>
  );
}
