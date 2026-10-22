"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Invoice, SeasonPaymentDetails } from "@/lib/season-billing";
import { formatMinor } from "@/lib/format-money";
import {
  declarePaidAction,
  type BillingActionState,
} from "@/app/admin/accounts/billing-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";
import DueCountdown from "./due-countdown";
import PaymentQr from "./payment-qr";
import { paymentQrPayload } from "@/lib/payment-qr";

const INITIAL: BillingActionState = { ok: false, message: "" };

/** What to put in the transfer so an admin can match it without asking. */
export function transferReference(playerName: string, period: string): string {
  return `Sideline ${period} ${playerName}`.replace(/\s+/g, " ").trim();
}

export default function PaymentsTab({
  invoices,
  details,
  playerName,
  uncreditedMinor,
}: {
  invoices: Invoice[];
  details: SeasonPaymentDetails;
  playerName: string;
  uncreditedMinor: number;
}) {
  const outstanding = invoices
    .filter((i) => !i.paidAt)
    .reduce((sum, i) => sum + i.totalMinor, 0);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Your subscription
        </h2>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            No bills yet. They&apos;re raised at the start of each month.
          </p>
        ) : (
          <>
            <p
              className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${
                outstanding > 0
                  ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                  : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
              }`}
            >
              {outstanding > 0
                ? `Outstanding: ${formatMinor(outstanding)}`
                : "You're all paid up."}
            </p>
            {uncreditedMinor > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                {formatMinor(uncreditedMinor)} of approved MultiSport credit will
                come off your next bill.
              </p>
            ) : null}
            <ul className="mt-3 space-y-2.5">
              {invoices.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} playerName={playerName} details={details} />
              ))}
            </ul>
          </>
        )}
      </section>

      <TransferDetails details={details} outstandingMinor={outstanding} />
    </div>
  );
}

function InvoiceCard({
  invoice,
  playerName,
  details,
}: {
  invoice: Invoice;
  playerName: string;
  details: SeasonPaymentDetails;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(declarePaidAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const reference = transferReference(playerName, invoice.period);
  const confirmed = invoice.paidAt != null;
  const declared = invoice.declaredPaidAt != null;
  const qr = paymentQrPayload(details.paymentAccount, details.paymentName, reference, invoice.totalMinor);

  return (
    <li className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {invoice.period}
            {confirmed ? (
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                confirmed
              </span>
            ) : declared ? (
              <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                sent — awaiting confirmation
              </span>
            ) : null}
          </p>
          <p className="text-xs text-neutral-500">
            {invoice.playingDays} Sundays ÷ {invoice.splitBetween}
            {invoice.roundingMinor > 0 ? ", rounded up" : ""}
            {invoice.creditMinor > 0
              ? ` · MultiSport −${formatMinor(invoice.creditMinor)}`
              : ""}
            {" · due "}
            {invoice.dueDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DueCountdown dueAtMs={invoice.dueAtMs} paid={confirmed || declared} />
          <span className="font-semibold tabular-nums">
            {formatMinor(invoice.totalMinor)}
          </span>
        </div>
      </div>

      {!confirmed ? (
        <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/5">
          <CopyRow label="Reference to write" value={reference} />
          <div className="mt-2">
            <CopyRow label="Amount" value={formatMinor(invoice.totalMinor)} copyValue={(invoice.totalMinor / 100).toFixed(2)} />
          </div>
          {!declared && invoice.totalMinor > 0 ? (
            <PaymentQr key={qr.ok ? qr.payload : qr.reason} result={qr} />
          ) : null}
          <form action={formAction} className="mt-2">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="declared" value={declared ? "false" : "true"} />
            <input type="hidden" name="note" value={reference} />
            <Button
              type="submit"
              variant={declared ? "secondary" : "primary"}
              pending={pending}
              pendingLabel="…"
            >
              {declared ? "I haven't paid yet" : "I've sent the payment"}
            </Button>
          </form>
          <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
        </div>
      ) : null}
    </li>
  );
}

function TransferDetails({
  details,
  outstandingMinor,
}: {
  details: SeasonPaymentDetails;
  outstandingMinor: number;
}) {
  const hasAny =
    details.paymentName || details.paymentAccount || details.paymentMethod || details.payLink;

  return (
    <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
        Where to send it
      </h2>
      {!hasAny ? (
        <p className="mt-3 text-sm text-neutral-500">
          An admin hasn&apos;t added the transfer details yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {details.paymentName ? (
            <CopyRow label="Recipient" value={details.paymentName} />
          ) : null}
          {details.paymentAccount ? (
            <CopyRow label="Account / number" value={details.paymentAccount} />
          ) : null}
          {details.paymentMethod ? (
            <p className="text-sm">
              <span className="text-neutral-500">Method: </span>
              {details.paymentMethod}
            </p>
          ) : null}
          {details.paymentNote ? (
            <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
              {details.paymentNote}
            </p>
          ) : null}
          {details.payLink ? (
            outstandingMinor > 0 ? (
              <a
                href={details.payLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Pay {formatMinor(outstandingMinor)} ↗
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed rounded-xl bg-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              >
                ✓ Nothing to pay
              </button>
            )
          ) : null}
        </div>
      )}
    </section>
  );
}

function CopyRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(copyValue ?? value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => setCopied(false),
          );
        }}
        className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium transition hover:bg-white dark:border-white/15 dark:hover:bg-neutral-700"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
