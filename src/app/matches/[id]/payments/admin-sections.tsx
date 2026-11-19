/**
 * The admin's per-match payment sections (session charges, facility payment,
 * normal-match pot), shown on Admin ▸ Payments ▸ Matches.
 */
import {
  computeSummary,
  getPaymentMeta,
  getPaymentRows,
  getTotalPaymentChange,
  isSeasonMatch,
} from "@/lib/payments";
import { listGuests } from "@/lib/guests";
import {
  getMatchChargeContext,
  getMatchdaySettlement,
  listGuestCharges,
} from "@/lib/season-fund";
import {
  getSubscriptionSeasonForMatch,
  listSubscribers,
} from "@/lib/season-subscriptions";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { PaymentsAdmin } from "./payments-admin";
import SessionCharges from "./session-charges";
import MatchdaySettlementCard from "./matchday-settlement";

/** Everything the admin manages for one match's payments. */
export async function MatchPaymentsAdmin({ matchId }: { matchId: number }) {
  const seasonMatch = await isSeasonMatch(matchId);
  return (
    <>
      <SessionChargesSection matchId={matchId} />
      {seasonMatch ? <SeasonPotNotice /> : <AdminSection matchId={matchId} />}
    </>
  );
}

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

