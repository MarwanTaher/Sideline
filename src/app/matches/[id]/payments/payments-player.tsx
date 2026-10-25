"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { playerSetAllPaidAction, type PaymentActionState } from "./actions";
import type { PlayerPaymentMatch } from "@/lib/payments";
import { formatAmount } from "@/lib/currency";
import { fmtDate, matchLabel } from "@/lib/format";
import { FeedbackMessage } from "@/components/ui/banner";
import { CopyButton, CopyField } from "@/components/ui/copy-field";

const INITIAL: PaymentActionState = { ok: false, message: "" };

function MatchCard({ m, showHeader }: { m: PlayerPaymentMatch; showHeader: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(playerSetAllPaidAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const heads = (m.inRoster ? 1 : 0) + m.guests.length;
  const paidHeads = (m.inRoster && m.paid ? 1 : 0) + m.guests.filter((g) => g.paid).length;
  const fmt = (n: number) => formatAmount(n, m.currency);
  const due = (heads - paidHeads) * m.share;
  const settled = paidHeads === heads;
  const shown = settled ? heads * m.share : due;

  const guestNames = m.guests.map((g) => g.name).join(", ");
  const breakdown =
    m.guests.length === 0
      ? null
      : `${m.inRoster ? `You + ${guestNames}` : `Your guests ${guestNames}`} · ${fmt(m.share)} each`;
  const partly = !settled && paidHeads > 0 ? `${fmt(paidHeads * m.share)} already marked paid` : null;
  const reference = `Match ${m.matchId} · ${m.playerName || "your name"}`;
  const hasDetails = Boolean(m.paymentName || m.paymentMobile || m.paymentMethod || m.paymentNote);

  const details = hasDetails ? (
    <>
      <div className="divide-y divide-black/5 dark:divide-white/10">
        <CopyField label="Recipient" value={m.paymentName} />
        <CopyField label="Phone / account" value={m.paymentMobile} />
        <CopyField label="Reference" value={reference} />
      </div>
      {m.paymentMethod || m.paymentNote ? (
        <p className="mt-1 text-xs text-neutral-500">
          {m.paymentMethod ? <span className="font-medium text-neutral-600 dark:text-neutral-300">Pay via {m.paymentMethod}. </span> : null}
          {m.paymentNote}
        </p>
      ) : null}
    </>
  ) : null;

  return (
    <div className="space-y-3">
      {showHeader ? (
        <div>
          <h2 className="text-lg font-semibold">{matchLabel(m.playedOn)}</h2>
          <p className="text-sm text-neutral-500">{fmtDate(m.playedOn)}</p>
        </div>
      ) : null}

      <section
        className={`rounded-2xl p-5 ${
          settled
            ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
            : "bg-amber-50 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">
          {settled ? "Settled" : "To pay"}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-3xl font-extrabold tabular-nums">{fmt(shown)}</p>
          {settled ? null : <CopyButton value={String(due)} label="amount" />}
        </div>
        {breakdown || partly || settled ? (
          <p className="mt-1 text-sm opacity-80">
            {[breakdown, partly, settled ? "Thanks — you're all set for this match." : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </section>

      {settled ? (
        details ? (
          <details className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium text-neutral-500">Transfer details</summary>
            <div className="mt-1">{details}</div>
          </details>
        ) : null
      ) : details ? (
        <section className="rounded-2xl border border-black/10 px-4 py-2 dark:border-white/10">{details}</section>
      ) : (
        <p className="rounded-2xl border border-dashed border-black/15 p-4 text-sm text-neutral-500 dark:border-white/15">
          The admin hasn&apos;t added transfer details yet.
        </p>
      )}

      <form action={action} className="space-y-2">
        <input type="hidden" name="matchId" value={m.matchId} />
        <input type="hidden" name="paid" value={settled ? "0" : "1"} />
        {settled ? (
          <>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            >
              ✓ Paid
            </button>
            <button
              type="submit"
              disabled={pending}
              className="mx-auto block min-h-9 text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-600 disabled:opacity-50 dark:hover:text-neutral-200"
            >
              {pending ? "Saving…" : "Not paid yet? Undo"}
            </button>
          </>
        ) : (
          <div className="flex gap-2">
            {m.payLink ? (
              <a
                href={m.payLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold transition hover:bg-neutral-50 active:scale-[0.98] dark:border-white/15 dark:hover:bg-neutral-900"
              >
                Open payment link ↗
              </a>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Saving…" : "I've paid"}
            </button>
          </div>
        )}
        {state.message && !state.ok ? <FeedbackMessage ok={false} message={state.message} /> : null}
      </form>
    </div>
  );
}

export function PaymentsPlayer({ matches }: { matches: PlayerPaymentMatch[] }) {
  if (matches.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
        No open payments right now. When an admin opens payments for a match you played
        in, your share will appear here.
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-8">
      {matches.map((m) => (
        <MatchCard key={m.matchId} m={m} showHeader />
      ))}
    </div>
  );
}

/** Single-match variant used inside a match's Payments tab. */
export function PaymentsPlayerMatch({ match }: { match: PlayerPaymentMatch }) {
  return (
    <div className="mt-4">
      <MatchCard m={match} showHeader={false} />
    </div>
  );
}
