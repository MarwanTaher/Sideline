"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { paymentQrPayload } from "@/lib/payment-qr";
import { formatOwed } from "@/lib/dues-summary";
import { CopyButton, CopyField } from "@/components/ui/copy-field";
import { FeedbackMessage } from "@/components/ui/banner";
import PaymentQr from "@/app/season/payment-qr";
import { declarePaymentsAction, type PayActionState } from "./actions";

const INITIAL: PayActionState = { ok: false, message: "" };

export type PayGroupLine = { key: string; title: string; detail: string; amount: string };

/**
 * One payee on My payments: what goes to them, how to pay (copy fields, QR,
 * pay link), and one "I've paid" for all of it — or, once sent, an Undo.
 */
export function PayGroup({
  title,
  lines,
  keys,
  seasonId,
  owedByCurrency,
  amountMinor,
  waiting,
  recipient,
  account,
  method,
  note,
  payLink,
  reference,
  directTo,
}: {
  title: string;
  lines: PayGroupLine[];
  keys: string[];
  seasonId: number | null;
  owedByCurrency: Record<string, number>;
  /** PLN amount for the QR code. */
  amountMinor: number;
  /** Already sent: show Undo instead of the payment details. */
  waiting: boolean;
  recipient?: string;
  account?: string;
  method?: string;
  note?: string;
  payLink?: string;
  reference: string;
  /** Paid to a subscriber directly: there are no group account details. */
  directTo?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(declarePaymentsAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const hasDetails = Boolean(recipient || account || method || note);
  const qr = account ? paymentQrPayload(account, recipient ?? "", reference, amountMinor) : null;
  const total = formatOwed(owedByCurrency);

  return (
    <section
      className={`rounded-2xl border p-4 ${
        waiting
          ? "border-sky-500/30 bg-sky-50/60 dark:bg-sky-950/20"
          : "border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <p className="text-xl font-extrabold tabular-nums">{total}</p>
          {!waiting && amountMinor > 0 ? (
            <CopyButton value={(amountMinor / 100).toFixed(2)} label="amount" />
          ) : null}
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.key} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="font-medium">{l.title}</span>
              {l.detail ? <span className="text-neutral-500"> · {l.detail}</span> : null}
            </span>
            {lines.length > 1 ? <span className="shrink-0 tabular-nums">{l.amount}</span> : null}
          </li>
        ))}
      </ul>

      {!waiting ? (
        directTo ? (
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            Pay {directTo} directly (cash or transfer), then mark it here so an admin can confirm.
          </p>
        ) : hasDetails ? (
          <div className="mt-3 rounded-xl border border-black/10 bg-white px-3 py-1 dark:border-white/10 dark:bg-neutral-900">
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {recipient ? <CopyField label="Recipient" value={recipient} /> : null}
              {account ? <CopyField label="Account / number" value={account} /> : null}
              <CopyField label="Reference" value={reference} />
            </div>
            {method || note ? (
              <p className="mt-1 pb-1 text-xs text-neutral-500">
                {method ? <span className="font-medium text-neutral-600 dark:text-neutral-300">Pay via {method}. </span> : null}
                {note}
              </p>
            ) : null}
            {qr ? (
              <div className="pb-2">
                <PaymentQr key={qr.ok ? qr.payload : qr.reason} result={qr} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-black/15 p-3 text-sm text-neutral-500 dark:border-white/15">
            An admin hasn&apos;t added the transfer details yet.
          </p>
        )
      ) : null}

      <form action={action} className="mt-3 space-y-2">
        {keys.map((k) => (
          <input key={k} type="hidden" name="key" value={k} />
        ))}
        {seasonId != null ? <input type="hidden" name="seasonId" value={seasonId} /> : null}
        <input type="hidden" name="note" value={reference} />
        {waiting ? (
          <>
            <input type="hidden" name="undo" value="1" />
            <p className="text-sm text-sky-900 dark:text-sky-200">✓ Sent — waiting for an admin to confirm.</p>
            <button
              type="submit"
              disabled={pending}
              className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 disabled:opacity-50 dark:hover:text-neutral-200"
            >
              {pending ? "Saving…" : "Not sent yet? Undo"}
            </button>
          </>
        ) : (
          <div className="flex gap-2">
            {payLink ? (
              <a
                href={payLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-900"
              >
                Open payment link ↗
              </a>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {pending ? "Saving…" : "I've paid"}
            </button>
          </div>
        )}
        {state.message && !state.ok ? <FeedbackMessage ok={false} message={state.message} /> : null}
      </form>
    </section>
  );
}
