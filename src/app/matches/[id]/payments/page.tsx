import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { fmtDate, fmtMatchTime } from "@/lib/matches";
import { getAvailabilityMatch } from "@/lib/availability";
import { getPlayerPaymentForMatch, isPaymentsActive } from "@/lib/payments";
import { PaymentsPlayerMatch } from "@/app/payments/payments-player";
import { MatchNav } from "../match-nav";

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

  // Admins manage payments from the full payments tool.
  if (isAdmin) redirect(`/payments?match=${matchId}`);

  const playerId = session.user.playerId;
  const active = await isPaymentsActive(matchId);
  const view =
    active && playerId != null ? await getPlayerPaymentForMatch(matchId, playerId) : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Match {matchId}
      </Link>

      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Payments</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Match {match.id} · {fmtDate(match.playedOn)} at {fmtMatchTime(match.matchTime)}
      </p>

      {view ? (
        <PaymentsPlayerMatch match={view} />
      ) : (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
          {active
            ? "You have nothing to pay for this match."
            : "Payments are not open for this match yet."}
        </p>
      )}
    </main>
  );
}
