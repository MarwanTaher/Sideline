import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import {
  computeSummary,
  getPaymentMeta,
  getPaymentRows,
  getPlayerPaymentMatches,
  listMatchesForPayments,
} from "@/lib/payments";
import { listGuests } from "@/lib/guests";
import { PaymentsAdmin } from "./payments-admin";
import { PaymentsPlayer } from "./payments-player";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Payments · Sideline",
};

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin =
    (await isAdminView(role === "admin" || role === "super")) &&
    !(await isTabLockedForCurrentUser("payments"));
  if (!isAdmin) {
    const playerId = session.user.playerId;
    const playerMatches =
      playerId == null ? [] : await getPlayerPaymentMatches(playerId);
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="flex items-center gap-3">
          <SectionIcon name="payments" className="h-9 w-9" />
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Your share for matches where payments are open. Mark yourself paid once you&apos;ve sent it.
        </p>
        <PaymentsPlayer matches={playerMatches} />
      </main>
    );
  }

  const matches = await listMatchesForPayments();

  if (matches.length === 0) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="flex items-center gap-3">
          <SectionIcon name="payments" className="h-9 w-9" />
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        </div>
        <p className="mt-3 text-sm text-neutral-500">No matches yet.</p>
      </main>
    );
  }

  const { match } = await searchParams;
  const parsed = Number(match);
  const selectedMatchId =
    Number.isInteger(parsed) && matches.some((m) => m.id === parsed) ? parsed : matches[0].id;

  const [meta, rows] = await Promise.all([
    getPaymentMeta(selectedMatchId),
    getPaymentRows(selectedMatchId),
  ]);

  const guests = await listGuests(selectedMatchId);

  const safeMeta = meta ?? {
    id: selectedMatchId,
    playedOn: "",
    totalPayment: 0,
    paymentName: "",
    paymentMobile: "",
    paymentMethod: "",
    paymentNote: "",
    paymentsActive: false,
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="payments" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Track the per-match pot, publish payment details, and mark who has paid.
      </p>

      <PaymentsAdmin
        matches={matches}
        selectedMatchId={selectedMatchId}
        meta={safeMeta}
        rows={rows}
        guests={guests}
        summary={computeSummary(rows, safeMeta.totalPayment, guests.map((g) => g.paid))}
      />
    </main>
  );
}
