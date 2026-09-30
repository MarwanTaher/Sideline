import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getTabLocksByAdmin, getPlayerAdminStatuses } from "@/lib/admins";
import type { AdminTabKey } from "@/lib/admin-tabs";
import { listSeasons } from "@/lib/seasons";
import {
  getActiveSubscriptionSeason,
  listSubscribers,
} from "@/lib/season-subscriptions";
import { getActivePlayers } from "@/lib/awards";
import {
  listInvoices,
  listInvoicePeriods,
  getBillingSummary,
  getRoundingLedger,
} from "@/lib/season-billing";
import { listPendingScans } from "@/lib/multisport";
import PlayerAdmins from "./player-admins";
import SeasonsAdmin from "./seasons-admin";
import SubscriptionAdmin from "./subscription-admin";
import BillingAdmin from "./billing-admin";

export const metadata = {
  title: "Admin control · Sideline",
};

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isAdminView(session.user.role === "super"))) redirect("/leaderboard");

  const [playerAdmins, tabLocks, seasons] = await Promise.all([
    getPlayerAdminStatuses(),
    getTabLocksByAdmin(),
    listSeasons(),
  ]);

  const subscriptionSeason = await getActiveSubscriptionSeason();
  const subscribers = subscriptionSeason
    ? await listSubscribers(subscriptionSeason.id)
    : [];
  const subscribed = new Set(subscribers.map((s) => s.playerId));
  const candidates = subscriptionSeason
    ? (await getActivePlayers())
        .filter((p) => !subscribed.has(p.id))
        .map((p) => ({ id: p.id, name: p.name }))
    : [];

  // Default to the current month, so the panel opens on what's being collected.
  const { period: periodParam } = await searchParams;
  const billing = subscriptionSeason
    ? await (async () => {
        const periods = await listInvoicePeriods(subscriptionSeason.id);
        const period =
          periodParam && /^\d{4}-\d{2}$/.test(periodParam)
            ? periodParam
            : (periods[0] ?? new Date().toISOString().slice(0, 7));
        const [invoices, summary, pendingScans, rounding] = await Promise.all([
          listInvoices(subscriptionSeason.id, period),
          getBillingSummary(subscriptionSeason.id, period),
          listPendingScans(),
          getRoundingLedger(subscriptionSeason.id),
        ]);
        return { periods, period, invoices, summary, pendingScans, rounding };
      })()
    : null;

  const lockedByAdmin: Record<number, AdminTabKey[]> = {};
  for (const [adminId, keys] of tabLocks) lockedByAdmin[adminId] = keys;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin control</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Promote a player to admin or remove their access, and control which
        sections each admin can use.
      </p>

      <PlayerAdmins players={playerAdmins} lockedByAdmin={lockedByAdmin} />

      <SeasonsAdmin seasons={seasons} />

      {subscriptionSeason ? (
        <SubscriptionAdmin
          season={subscriptionSeason}
          subscribers={subscribers}
          candidates={candidates}
        />
      ) : null}

      {subscriptionSeason && billing ? (
        <BillingAdmin
          seasonId={subscriptionSeason.id}
          seasonName={subscriptionSeason.name}
          period={billing.period}
          periods={billing.periods}
          invoices={billing.invoices}
          summary={billing.summary}
          rounding={billing.rounding}
          pendingScans={billing.pendingScans}
        />
      ) : null}

      <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
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
    </main>
  );
}
