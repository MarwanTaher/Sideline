import Link from "next/link";
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

  const match = await getAvailabilityMatch(matchId);
  if (!match) notFound();

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Back to match
      </Link>

      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Payments</h1>
      <p className="mt-1 text-sm text-neutral-500">
          {matchLabelWithTime(match.playedOn, match.matchTime)}
      </p>

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
    </p>
  );
}
