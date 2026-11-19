import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { fmtDate, matchLabel } from "@/lib/format";
import { formatMinor } from "@/lib/format-money";
import { listPlayerDues } from "@/lib/dues";
import {
  bucketDues,
  clubToday,
  dueTitle,
  duePayeeLabel,
  formatDueAmount,
  formatOwed,
  groupDuesByPayee,
  isOverdue,
  type Due,
  type PayeeGroup,
} from "@/lib/dues-summary";
import { getPaymentDetails } from "@/lib/season-billing";
import { combinedTransferReference, monthLabel } from "@/lib/season-payment-summary";
import { getPlayerPaymentForMatch } from "@/lib/payments";
import { listPlayerCharges } from "@/lib/season-fund";
import { uncreditedTotalMinor } from "@/lib/multisport";
import { PaymentsPlayerMatch } from "@/app/matches/[id]/payments/payments-player";
import { PayGroup, type PayGroupLine } from "./pay-group";

export const metadata = {
  title: "Payments · Sideline",
};

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 20;

/**
 * The player's one payments page (review §5.3): everything they owe or have
 * paid — season bills, match pot shares, session and replacement charges —
 * from the dues ledger, grouped by who the money goes to, with the payment
 * details and one "I've paid" per payee. Season ▸ Payments and a match's
 * Payments tab both lead here.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const playerId = session.user.playerId;
  if (playerId == null) redirect("/");
  const pid = Number(playerId);
  const playerName = session.user.name ?? "";

  const { match } = await searchParams;
  const matchFilter = match && /^\d+$/.test(match) ? Number(match) : null;

  const today = clubToday();
  const [allDues, uncredited, charges] = await Promise.all([
    listPlayerDues(pid),
    uncreditedTotalMinor(pid),
    listPlayerCharges(pid),
  ]);
  const dues = matchFilter == null ? allDues : allDues.filter((d) => d.matchId === matchFilter);
  const b = bucketDues(dues, today);
  const owed = formatOwed(b.owedByCurrency);
  const refundMinor = charges
    .filter((c) => matchFilter == null || c.matchId === matchFilter)
    .reduce((sum, c) => sum + c.refundDueMinor, 0);

  const toPay = await Promise.all(
    groupDuesByPayee(b.toPay).map((g) => renderGroup(g, { pid, playerName, waiting: false, today })),
  );
  const waiting = await Promise.all(
    groupDuesByPayee(b.waiting).map((g) => renderGroup(g, { pid, playerName, waiting: true, today })),
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm font-semibold tabular-nums">
          {owed ? `You owe ${owed}` : "Nothing to pay"}
        </p>
      </div>
      {matchFilter != null ? (
        <p className="mt-1 text-sm text-neutral-500">
          Showing one match.{" "}
          <Link href="/payments" className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-300">
            Show everything
          </Link>
        </p>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">
          Everything you owe, in one place. Match shares count as paid when you mark them;
          season bills and session fees are confirmed by an admin when the money arrives.
        </p>
      )}

      {uncredited > 0 || refundMinor > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-emerald-800 dark:text-emerald-300">
          {uncredited > 0 ? (
            <li>{formatMinor(uncredited)} of approved MultiSport credit comes off your next season bill.</li>
          ) : null}
          {refundMinor > 0 ? (
            <li>
              Your MultiSport scan was approved after you paid, so {formatMinor(refundMinor)} is coming back to you.
            </li>
          ) : null}
        </ul>
      ) : null}

      <Section title="To pay" count={b.toPay.length}>
        {toPay.length === 0 ? <Empty>You&apos;re all settled.</Empty> : <div className="space-y-4">{toPay}</div>}
      </Section>

      {waiting.length > 0 ? (
        <Section title="Waiting for confirmation" count={b.waiting.length}>
          <div className="space-y-4">{waiting}</div>
        </Section>
      ) : null}

      {b.history.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-neutral-500">
            History ({b.history.length})
          </summary>
          <ul className="mt-2 divide-y divide-black/5 rounded-2xl border border-black/[0.06] bg-white px-4 dark:divide-white/10 dark:border-white/10 dark:bg-neutral-900">
            {b.history.slice(0, HISTORY_LIMIT).map((d) => (
              <HistoryRow key={d.key} due={d} />
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}

async function renderGroup(
  g: PayeeGroup,
  ctx: { pid: number; playerName: string; waiting: boolean; today: string },
): Promise<ReactNode> {
  // A normal match's pot: the match card has the details, guests and the
  // trusted "I've paid".
  if (g.kind === "match" && g.matchId != null) {
    const view = await getPlayerPaymentForMatch(g.matchId, ctx.pid);
    if (!view) return null;
    return (
      <div key={g.id} className="rounded-2xl border border-black/[0.06] bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
        <h3 className="text-sm font-semibold">
          Match pot · {matchLabel(view.playedOn)}
          {view.finalShare ? <span className="ml-2 text-xs font-normal text-neutral-500">share fixed by the admin</span> : null}
        </h3>
        <PaymentsPlayerMatch match={view} />
      </div>
    );
  }

  const lines: PayGroupLine[] = g.dues.map((d) => ({
    key: d.key,
    title: dueTitle(d),
    detail: isOverdue(d, ctx.today) ? `overdue since ${fmtDate(d.dueOn)}` : `due ${fmtDate(d.dueOn)}`,
    amount: formatDueAmount(d),
  }));
  const pln = g.owedByCurrency.PLN ?? 0;

  if (g.kind === "direct") {
    return (
      <PayGroup
        key={g.id}
        title={`To ${g.payeeName ?? "a subscriber"}`}
        lines={lines}
        keys={g.dues.map((d) => d.key)}
        seasonId={null}
        owedByCurrency={g.owedByCurrency}
        amountMinor={pln}
        waiting={ctx.waiting}
        reference={`Sideline replacement ${ctx.playerName}`}
        directTo={g.payeeName ?? "the subscriber"}
      />
    );
  }

  const details = g.seasonId ? await getPaymentDetails(g.seasonId) : null;
  const periods = g.dues.filter((d) => d.source === "season_invoice" && d.period).map((d) => d.period!);
  const reference =
    periods.length > 0
      ? combinedTransferReference(ctx.playerName, periods)
      : `Sideline fees ${ctx.playerName}`.trim();
  const what = [
    periods.length > 0 ? periods.map(monthLabel).join(", ") : "",
    g.dues.some((d) => d.source !== "season_invoice") ? "session fees" : "",
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <PayGroup
      key={g.id}
      title={`Group account · ${what}`}
      lines={lines}
      keys={g.dues.map((d) => d.key)}
      seasonId={g.seasonId}
      owedByCurrency={g.owedByCurrency}
      amountMinor={pln}
      waiting={ctx.waiting}
      recipient={details?.paymentName}
      account={details?.paymentAccount}
      method={details?.paymentMethod}
      note={details?.paymentNote}
      payLink={details?.payLink}
      reference={reference}
    />
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title} {count > 0 ? `(${count})` : ""}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-black/[0.06] bg-white p-4 text-sm text-neutral-500 dark:border-white/10 dark:bg-neutral-900">
      {children}
    </p>
  );
}

function HistoryRow({ due }: { due: Due }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{dueTitle(due)}</p>
        <p className="text-xs text-neutral-500">
          {duePayeeLabel(due)}
          {due.confirmedAt ? ` · paid ${fmtDate(due.confirmedAt.slice(0, 10))}` : ""}
        </p>
      </div>
      <span className="tabular-nums text-neutral-500">{formatDueAmount(due)} ✓</span>
    </li>
  );
}
