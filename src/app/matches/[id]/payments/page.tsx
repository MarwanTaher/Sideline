import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { matchLabelWithTime } from "@/lib/format";
import { getAvailabilityMatch } from "@/lib/availability";
import {
  computeSummary,
  getPaymentMeta,
  getPaymentRows,
  getTotalPaymentChange,
  isSeasonMatch,
} from "@/lib/payments";
import { listGuests } from "@/lib/guests";
import { PaymentsAdmin } from "./payments-admin";
import { MatchNav } from "../match-nav";
import {
  getMatchChargeContext,
  getMatchdaySettlement,
  listGuestCharges,
} from "@/lib/season-fund";
import {
  getSubscriptionSeasonForMatch,
  listSubscribers,
} from "@/lib/season-subscriptions";
import SessionCharges from "./session-charges";
import MatchdaySettlementCard from "./matchday-settlement";
import { getMatchDetail } from "@/lib/matches";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { getMatchPhase } from "@/lib/match-phase";
import { MatchPageHeader } from "../match-page-header";
import { DEFAULT_CURRENCY } from "@/lib/currency";

export const metadata = {
  title: "Payments · Sideline",
};

export const dynamic = "force-dynamic";

export default async function MatchPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  // Players have one Payments page; this match's tab opens it filtered.
  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  if (!isAdmin) redirect(`/payments?match=${matchId}`);

  const [match, detail, lockEnabled, seasonMatch] = await Promise.all([
    getAvailabilityMatch(matchId),
    getMatchDetail(matchId),
    isAvailabilityLockEnabled(),
    isSeasonMatch(matchId),
  ]);
  if (!match || !detail) notFound();

  const phase = getMatchPhase({
    matchdayStatus: match.matchdayStatus,
    availabilityOpen: match.availabilityOpen,
    kickoffAt: match.kickoffAt,
    lockEnabled,
    hasRoster: detail.teams.some((team) => team.players.length > 0),
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <MatchPageHeader
        matchId={matchId}
        dateLabel={matchLabelWithTime(match.playedOn, match.matchTime)}
        title="Payments"
        phase={phase}
      />
      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <SessionChargesSection matchId={matchId} />
      {seasonMatch ? <SeasonPotNotice /> : <AdminSection matchId={matchId} />}
    </main>
  );
}

/**
 * Season matches have no per-match pot: core seats are covered by the monthly
 * season invoice and everyone else owes a session charge. Hiding the pot here
 * removes the risk of subscribers being asked to pay twice.
 */
function SeasonPotNotice() {
  return (
    <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
      This is a season match, so there is no per-match pot. Subscribers pay through the monthly
      season invoice; other players and guests owe the session charges above.
    </p>
  );
}

/**
 * Only meaningful on a match linked to a subscription season (`season_id`),
 * the same test the charges and the pot use; silent everywhere else.
 */
async function SessionChargesSection({ matchId }: { matchId: number }) {
  const season = await getSubscriptionSeasonForMatch(matchId);
  if (!season) return null;

  const [context, charges, subscribers, settlement] = await Promise.all([
    getMatchChargeContext(matchId),
    listGuestCharges(matchId),
    listSubscribers(season.id),
    getMatchdaySettlement(matchId),
  ]);
  if (!context) return null;

  return (
    <>
      <SessionCharges
        context={context}
        charges={charges}
        subscribers={subscribers.map((s) => ({ playerId: s.playerId, name: s.name }))}
      />
      {settlement ? <MatchdaySettlementCard matchId={matchId} settlement={settlement} /> : null}
    </>
  );
}


async function AdminSection({ matchId }: { matchId: number }) {
  const [meta, rows, allGuests, totalChange] = await Promise.all([
    getPaymentMeta(matchId),
    getPaymentRows(matchId),
    listGuests(matchId),
    getTotalPaymentChange(),
  ]);

  // Only approved guests are part of the match, so only they owe a share.
  const guests = allGuests.filter((g) => g.status === "approved");

  const safeMeta = meta ?? {
    id: matchId,
    playedOn: "",
    totalPayment: 0,
    paymentName: "",
    paymentMobile: "",
    paymentMethod: "",
    paymentNote: "",
    payLink: "",
    paymentsActive: false,
    currency: DEFAULT_CURRENCY,
    finalShare: null,
  };

  return (
    <>
      <p className="mt-1 text-sm text-neutral-500">
        Track the pot, publish payment details, and mark who has paid.
      </p>
      <PaymentsAdmin
        selectedMatchId={matchId}
        meta={safeMeta}
        rows={rows}
        guests={guests}
        totalChange={totalChange}
        summary={computeSummary(
          rows,
          safeMeta.totalPayment,
          guests.map((g) => g.paid),
          safeMeta.finalShare,
        )}
      />
    </>
  );
}

