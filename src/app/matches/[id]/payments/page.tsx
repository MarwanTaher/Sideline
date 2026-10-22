import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { matchLabelWithTime } from "@/lib/format";
import { getAvailabilityMatch } from "@/lib/availability";
import {
  computeSummary,
  getPaymentMeta,
  getPaymentRows,
  getPlayerPaymentForMatch,
  getTotalPaymentChange,
  isPaymentsActive,
} from "@/lib/payments";
import { listGuests } from "@/lib/guests";
import { PaymentsAdmin } from "./payments-admin";
import { PaymentsPlayerMatch } from "./payments-player";
import { MatchNav } from "../match-nav";
import {
  getMatchChargeContext,
  listGuestCharges,
} from "@/lib/season-fund";
import {
  getSubscriptionSeasonForDate,
  listSubscribers,
} from "@/lib/season-subscriptions";
import SessionCharges from "./session-charges";
import { getMatchDetail } from "@/lib/matches";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { getMatchPhase } from "@/lib/match-phase";
import { MatchPageHeader } from "../match-page-header";
import { MessageAdminLink } from "@/components/message-admin-link";

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

  const [match, detail, lockEnabled] = await Promise.all([
    getAvailabilityMatch(matchId),
    getMatchDetail(matchId),
    isAvailabilityLockEnabled(),
  ]);
  if (!match || !detail) notFound();

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
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

      {isAdmin ? (
        <>
          <SessionChargesSection matchId={matchId} playedOn={match.playedOn} />
          <AdminSection matchId={matchId} />
        </>
      ) : (
        <PlayerSection matchId={matchId} playerId={session.user.playerId} />
      )}
    </main>
  );
}

/** Only meaningful inside a subscription season; silent everywhere else. */
async function SessionChargesSection({
  matchId,
  playedOn,
}: {
  matchId: number;
  playedOn: string;
}) {
  const season = await getSubscriptionSeasonForDate(playedOn);
  if (!season) return null;

  const [context, charges, subscribers] = await Promise.all([
    getMatchChargeContext(matchId),
    listGuestCharges(matchId),
    listSubscribers(season.id),
  ]);
  if (!context) return null;

  return (
    <SessionCharges
      context={context}
      charges={charges}
      subscribers={subscribers.map((s) => ({ playerId: s.playerId, name: s.name }))}
    />
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
        )}
      />
    </>
  );
}

async function PlayerSection({
  matchId,
  playerId,
}: {
  matchId: number;
  playerId: number | null;
}) {
  const active = await isPaymentsActive(matchId);
  const view =
    active && playerId != null ? await getPlayerPaymentForMatch(matchId, playerId) : null;

  if (view) {
    return <PaymentsPlayerMatch match={view} />;
  }

  return (
    <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
      {active
        ? "You have nothing to pay for this match."
        : "Payments are not open for this match yet."}
      {!active ? (
        <MessageAdminLink
          matchId={matchId}
          reason="I have a question about payments for this match."
        />
      ) : null}
    </p>
  );
}
