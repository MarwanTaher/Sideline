"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  playerSetPaidAction,
  playerSetGuestPaidAction,
  type PaymentActionState,
} from "./actions";
import type { PlayerPaymentMatch } from "@/lib/payments";
import { formatAmount } from "@/lib/currency";
import { fmtDate, matchLabel } from "@/lib/format";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: PaymentActionState = { ok: false, message: "" };

function useRefreshOnOk(state: PaymentActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const flash = (next: "copied" | "failed") => {
    setState(next);
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        if (!navigator.clipboard) return flash("failed");
        navigator.clipboard.writeText(value).then(
          () => flash("copied"),
          (error: unknown) => {
            console.error("Could not copy to the clipboard.", error);
            flash("failed");
          },
        );
      }}
      className={`min-h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition active:scale-95 ${
        state === "copied"
          ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : state === "failed"
            ? "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            : "border-black/10 text-neutral-700 hover:bg-white dark:border-white/15 dark:text-neutral-200 dark:hover:bg-neutral-800"
      }`}
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Couldn't copy" : "Copy"}
    </button>
  );
}

/** One transfer field with its own Copy button. */
function CopyField({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      <CopyButton value={copyValue ?? value} label={label.toLowerCase()} />
    </div>
  );
}

/** "I've paid" while unpaid; a greyed ✓ Paid with a quiet undo once marked. */
function PaidControl({
  matchId,
  guestId,
  paid,
}: {
  matchId: number;
  guestId?: number;
  paid: boolean;
}) {
  const [state, action, pending] = useActionState(
    guestId == null ? playerSetPaidAction : playerSetGuestPaidAction,
    INITIAL,
  );
  useRefreshOnOk(state);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="matchId" value={matchId} />
      {guestId != null ? <input type="hidden" name="guestId" value={guestId} /> : null}
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      {paid ? (
        <span className="flex items-center gap-2">
          <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            ✓ Paid
          </span>
          <button
            type="submit"
            disabled={pending}
            className="min-h-9 text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-600 disabled:opacity-50 dark:hover:text-neutral-200"
          >
            {pending ? "…" : "Undo"}
          </button>
        </span>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-60"
        >
          {pending ? "Saving…" : "I've paid"}
        </button>
      )}
      {state.message && !state.ok ? <FeedbackMessage ok={false} message={state.message} /> : null}
    </form>
  );
}

function MatchCard({ m, showHeader }: { m: PlayerPaymentMatch; showHeader: boolean }) {
  const items = [
    ...(m.inRoster ? [{ key: "me", label: "Your share", paid: m.paid, guestId: undefined }] : []),
    ...m.guests.map((g) => ({ key: `g${g.id}`, label: `Guest · ${g.name}`, paid: g.paid, guestId: g.id })),
  ];
  const fmt = (n: number) => formatAmount(n, m.currency);
  const total = items.length * m.share;
  const unpaidCount = items.filter((i) => !i.paid).length;
  const due = unpaidCount * m.share;
  const allPaid = unpaidCount === 0;
  const reference = `Match ${m.matchId} · ${m.playerName || "your name"}`;
  const hasDetails = Boolean(m.paymentName || m.paymentMobile || m.paymentMethod || m.paymentNote || m.payLink);

  const details = (
    <>
      <div className="divide-y divide-black/5 dark:divide-white/10">
        <CopyField label="Recipient" value={m.paymentName} />
        <CopyField label="Phone / account" value={m.paymentMobile} />
        <CopyField label="Amount" value={fmt(allPaid ? total : due)} copyValue={String(allPaid ? total : due)} />
        <CopyField label="Reference" value={reference} />
      </div>
      {m.paymentMethod || m.paymentNote ? (
        <p className="mt-2 text-xs text-neutral-500">
          {m.paymentMethod ? <span className="font-medium text-neutral-600 dark:text-neutral-300">Pay via {m.paymentMethod}. </span> : null}
          {m.paymentNote}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="space-y-3">
      {showHeader ? (
        <div>
          <h2 className="text-lg font-semibold">{matchLabel(m.playedOn)}</h2>
          <p className="text-sm text-neutral-500">{fmtDate(m.playedOn)}</p>
        </div>
      ) : null}

      {/* Status: the one place the amount is shown. */}
      <section
        className={`rounded-2xl p-5 ${
          allPaid
            ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
            : "bg-amber-50 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">
          {allPaid ? "All paid" : "To pay"}
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {allPaid ? `✓ ${fmt(total)}` : fmt(due)}
        </p>
        <p className="mt-1 text-sm opacity-80">
          {allPaid
            ? "Thanks — you're settled for this match."
            : items.length > 1
              ? `${fmt(m.share)} each for you and ${m.guests.length} guest${m.guests.length === 1 ? "" : "s"}${
                  unpaidCount < items.length ? ` · ${fmt(total - due)} already paid` : ""
                }`
              : "Your share of the pitch for this match."}
        </p>
      </section>

      {hasDetails ? (
        allPaid ? (
          <details className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium text-neutral-500">Transfer details</summary>
            <div className="mt-2">{details}</div>
          </details>
        ) : (
          <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Send it to</h3>
            <div className="mt-1">{details}</div>
          </section>
        )
      ) : (
        <p className="rounded-2xl border border-dashed border-black/15 p-4 text-sm text-neutral-500 dark:border-white/15">
          The admin hasn&apos;t added transfer details yet.
        </p>
      )}

      {m.payLink ? (
        allPaid ? (
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
          >
            ✓ Paid
          </button>
        ) : (
          <a
            href={m.payLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            Pay {fmt(due)} ↗
          </a>
        )
      ) : null}

      <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {allPaid ? "Payment status" : "After you transfer, mark it here"}
        </h3>
        <ul className="mt-1 divide-y divide-black/5 dark:divide-white/10">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="text-xs text-neutral-500 tabular-nums">{fmt(m.share)}</p>
              </div>
              <PaidControl matchId={m.matchId} guestId={item.guestId} paid={item.paid} />
            </li>
          ))}
        </ul>
      </section>
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
