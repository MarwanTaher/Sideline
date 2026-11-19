import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { fmtDate } from "@/lib/format";
import { listPlayerDues } from "@/lib/dues";
import {
  bucketDues,
  clubToday,
  dueTitle,
  duePayeeLabel,
  formatDueAmount,
  formatOwed,
  isOverdue,
  type Due,
} from "@/lib/dues-summary";
import { SeasonSentButton, SharePaidButton } from "./due-buttons";

export const metadata = {
  title: "My payments · Sideline",
};

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 12;

/**
 * My payments (review §5.3, P1.2): everything the player owes or has paid,
 * across the match pot, season invoices and session charges. Actions reuse
 * each system's existing server actions; full payment details (QR, copy
 * fields) stay on the source page each row links to.
 */
export default async function MyPaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const playerId = session.user.playerId;
  if (playerId == null) redirect("/");

  const today = clubToday();
  const dues = await listPlayerDues(Number(playerId));
  const b = bucketDues(dues, today);
  const owed = formatOwed(b.owedByCurrency);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">My payments</h1>
        <p className="text-sm font-semibold tabular-nums">
          {owed ? `You owe ${owed}` : "Nothing to pay"}
        </p>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Match shares are marked paid by you. Season bills and session fees are
        confirmed by an admin when the money arrives.
      </p>

      <Section title="To pay" count={b.toPay.length}>
        {b.toPay.length === 0 ? (
          <Empty>You&apos;re all settled.</Empty>
        ) : (
          <DueList dues={b.toPay} today={today} mode="pay" />
        )}
      </Section>

      {b.waiting.length > 0 ? (
        <Section title="Waiting for confirmation" count={b.waiting.length}>
          <DueList dues={b.waiting} today={today} mode="waiting" />
        </Section>
      ) : null}

      {b.history.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-neutral-500">
            History ({b.history.length})
          </summary>
          <DueList dues={b.history.slice(0, HISTORY_LIMIT)} today={today} mode="history" />
        </details>
      ) : null}
    </main>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title} {count > 0 ? `(${count})` : ""}
      </h2>
      <div className="mt-2 rounded-2xl border border-black/[0.06] bg-white px-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-neutral-500">{children}</p>;
}

/**
 * Rows with an action button only once per action: one "I've paid" per match
 * (it covers the player and their guests) and one "I've sent it" per season
 * (it covers every open bill), matching the existing actions.
 */
function DueList({
  dues,
  today,
  mode,
}: {
  dues: Due[];
  today: string;
  mode: "pay" | "waiting" | "history";
}) {
  const shown = new Set<string>();
  return (
    <ul className="divide-y divide-black/5 dark:divide-white/10">
      {dues.map((d) => {
        let action: ReactNode = null;
        if (mode !== "history") {
          const groupKey =
            d.source === "match_share" ? `m${d.matchId}` : d.source === "season_invoice" ? `s${d.seasonId}` : null;
          if (groupKey && !shown.has(groupKey)) {
            shown.add(groupKey);
            if (d.source === "match_share" && d.matchId != null) {
              action = <SharePaidButton matchId={d.matchId} paid={false} />;
            } else if (d.source === "season_invoice" && d.seasonId != null) {
              action = <SeasonSentButton seasonId={d.seasonId} declared={mode === "waiting"} />;
            }
          }
        }
        return <DueItem key={d.key} due={d} today={today} mode={mode} action={action} />;
      })}
    </ul>
  );
}

function DueItem({
  due,
  today,
  mode,
  action,
}: {
  due: Due;
  today: string;
  mode: "pay" | "waiting" | "history";
  action: ReactNode;
}) {
  const href =
    due.source === "season_invoice"
      ? "/season?tab=payments"
      : due.matchId != null
        ? `/matches/${due.matchId}/payments`
        : null;
  const overdue = mode === "pay" && isOverdue(due, today);
  const status =
    mode === "history"
      ? "✓ Paid"
      : mode === "waiting"
        ? "Sent · waiting for an admin"
        : due.source === "session_fee" || due.source === "replacement"
          ? "An admin marks it paid"
          : `Due ${fmtDate(due.dueOn)}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium">
          {href ? (
            <Link href={href} className="underline-offset-2 hover:underline">
              {dueTitle(due)}
            </Link>
          ) : (
            dueTitle(due)
          )}
        </p>
        <p className="text-xs text-neutral-500">
          {duePayeeLabel(due)} ·{" "}
          <span className={overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
            {overdue ? `Overdue since ${fmtDate(due.dueOn)}` : status}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold tabular-nums">{formatDueAmount(due)}</span>
        {action}
      </div>
    </li>
  );
}
