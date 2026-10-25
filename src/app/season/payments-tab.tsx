"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Invoice, SeasonPaymentDetails } from "@/lib/season-billing";
import { formatMinor } from "@/lib/format-money";
import {
  combinedTransferReference,
  monthLabel,
  summarizePlayerInvoices,
} from "@/lib/season-payment-summary";
import {
  declareAllPaidAction,
  type BillingActionState,
} from "@/app/admin/accounts/billing-actions";
import { FeedbackMessage } from "@/components/ui/banner";
import { CopyButton, CopyField } from "@/components/ui/copy-field";
import DueCountdown from "./due-countdown";
import PaymentQr from "./payment-qr";
import { paymentQrPayload } from "@/lib/payment-qr";

const INITIAL: BillingActionState = { ok: false, message: "" };

export default function PaymentsTab({
  seasonId,
  invoices,
  details,
  playerName,
  uncreditedMinor,
}: {
  seasonId: number;
  invoices: Invoice[];
  details: SeasonPaymentDetails;
  playerName: string;
  uncreditedMinor: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(declareAllPaidAction, INITIAL);
  const [showPrevious, setShowPrevious] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (invoices.length === 0) {
    return (
      <p className="rounded-2xl border border-black/10 p-5 text-sm text-neutral-500 dark:border-white/10">
        No bills yet. They&apos;re raised at the start of each month.
      </p>
    );
  }

  const s = summarizePlayerInvoices(invoices);
  const mode = s.toSend.length > 0 ? "pay" : s.sent.length > 0 ? "sent" : "settled";
  const current = mode === "pay" ? s.toSend : s.sent;
  const amountMinor = mode === "pay" ? s.toSendMinor : s.sentMinor;
  const reference = combinedTransferReference(
    playerName,
    (mode === "pay" ? s.toSend : s.sent).map((i) => i.period),
  );
  const qr = paymentQrPayload(details.paymentAccount, details.paymentName, reference, s.toSendMinor);
  const hasDetails = Boolean(
    details.paymentName || details.paymentAccount || details.paymentMethod || details.paymentNote,
  );

  const tone =
    mode === "pay"
      ? "bg-amber-50 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100"
      : mode === "sent"
        ? "bg-sky-50 text-sky-950 dark:bg-sky-950/25 dark:text-sky-100"
        : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100";

  const transfer = hasDetails ? (
    <>
      <div className="divide-y divide-black/5 dark:divide-white/10">
        <CopyField label="Recipient" value={details.paymentName} />
        <CopyField label="Account / number" value={details.paymentAccount} />
        {mode === "pay" ? <CopyField label="Reference" value={reference} /> : null}
      </div>
      {details.paymentMethod || details.paymentNote ? (
        <p className="mt-1 text-xs text-neutral-500">
          {details.paymentMethod ? (
            <span className="font-medium text-neutral-600 dark:text-neutral-300">
              Pay via {details.paymentMethod}.{" "}
            </span>
          ) : null}
          {details.paymentNote}
        </p>
      ) : null}
    </>
  ) : null;

  return (
    <div className="space-y-3">
      <section className={`rounded-2xl p-5 ${tone}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-70">
            {mode === "pay" ? "To pay" : mode === "sent" ? "Sent — awaiting confirmation" : "Settled"}
          </p>
          {mode === "pay" ? <DueCountdown dueAtMs={s.nextDueAtMs} paid={false} /> : null}
        </div>

        {mode === "settled" ? (
          <p className="mt-1 text-2xl font-extrabold">You&apos;re all paid up.</p>
        ) : (
          <>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-3xl font-extrabold tabular-nums">{formatMinor(amountMinor)}</p>
              {mode === "pay" ? (
                <CopyButton value={(amountMinor / 100).toFixed(2)} label="amount" />
              ) : null}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {current.map((inv) => (
                <li key={inv.id} className="flex items-baseline justify-between gap-3 opacity-90">
                  <span className="min-w-0">
                    <span className="font-medium">{monthLabel(inv.period)}</span>
                    <span className="opacity-70">
                      {" · "}
                      {inv.playingDays} Sundays ÷ {inv.splitBetween}
                      {inv.creditMinor > 0 ? ` · MultiSport −${formatMinor(inv.creditMinor)}` : ""}
                      {` · due ${inv.dueDate}`}
                    </span>
                  </span>
                  {current.length > 1 ? (
                    <span className="shrink-0 tabular-nums">{formatMinor(inv.totalMinor)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {mode === "pay" && s.sent.length > 0 ? (
          <p className="mt-2 text-xs opacity-80">
            {formatMinor(s.sentMinor)} already sent for{" "}
            {s.sent.map((i) => monthLabel(i.period)).join(", ")} — awaiting confirmation.
          </p>
        ) : null}
        {uncreditedMinor > 0 ? (
          <p className="mt-2 text-xs opacity-80">
            {formatMinor(uncreditedMinor)} of approved MultiSport credit comes off your next bill.
          </p>
        ) : null}
      </section>

      {mode === "pay" ? (
        transfer ? (
          <section className="rounded-2xl border border-black/10 px-4 py-2 dark:border-white/10">
            {transfer}
            {s.toSendMinor > 0 ? (
              <div className="pb-2">
                <PaymentQr key={qr.ok ? qr.payload : qr.reason} result={qr} />
              </div>
            ) : null}
          </section>
        ) : (
          <p className="rounded-2xl border border-dashed border-black/15 p-4 text-sm text-neutral-500 dark:border-white/15">
            An admin hasn&apos;t added the transfer details yet.
          </p>
        )
      ) : transfer ? (
        <details className="rounded-2xl border border-black/10 px-4 py-3 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-medium text-neutral-500">
            Transfer details
          </summary>
          <div className="mt-1">{transfer}</div>
        </details>
      ) : null}

      <form action={action} className="space-y-2">
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="declared" value={mode === "pay" ? "true" : "false"} />
        <input type="hidden" name="note" value={reference} />
        {mode === "pay" ? (
          <div className="flex gap-2">
            {details.payLink ? (
              <a
                href={details.payLink}
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
              {pending ? "Saving…" : "I've sent it"}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            >
              {mode === "sent" ? "✓ Sent — waiting for an admin" : "✓ Paid"}
            </button>
            {mode === "sent" ? (
              <button
                type="submit"
                disabled={pending}
                className="mx-auto block min-h-9 text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-600 disabled:opacity-50 dark:hover:text-neutral-200"
              >
                {pending ? "Saving…" : "Not sent yet? Undo"}
              </button>
            ) : null}
          </>
        )}
        {state.message && !state.ok ? <FeedbackMessage ok={false} message={state.message} /> : null}
      </form>

      {s.previous.length > 0 ? (
        <section className="pt-2">
          <button
            type="button"
            aria-expanded={showPrevious}
            onClick={() => setShowPrevious((v) => !v)}
            className="flex min-h-9 w-full items-center justify-between rounded-xl px-1 text-sm font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            <span>
              {showPrevious ? "Hide" : "Show"} previous bills ({s.previous.length})
            </span>
            <span aria-hidden className={`transition ${showPrevious ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {showPrevious ? (
            <ul className="mt-1 divide-y divide-black/5 rounded-2xl border border-black/10 px-4 dark:divide-white/10 dark:border-white/10">
              {s.previous.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{monthLabel(inv.period)}</p>
                    <p className="text-xs text-neutral-500">
                      {inv.playingDays} Sundays ÷ {inv.splitBetween}
                      {inv.creditMinor > 0 ? ` · MultiSport −${formatMinor(inv.creditMinor)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-neutral-500">{formatMinor(inv.totalMinor)}</span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {inv.paidAt ? "paid" : "covered"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
