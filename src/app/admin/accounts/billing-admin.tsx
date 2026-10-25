"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Invoice,
  SeasonBillingSummary,
  SeasonRates,
  SeasonPaymentDetails,
  WithdrawnInvoiceWarning,
} from "@/lib/season-billing";
import type { LeftoverCredit, MultisportScan } from "@/lib/multisport";
import { isCreditStranded } from "@/lib/multisport-rules";
import { formatMinor } from "@/lib/format-money";
import {
  generateInvoicesAction,
  setInvoicePaidAction,
  setPlayingDaysAction,
  deleteInvoiceAction,
  setInvoiceHiddenAction,
  settleLeftoverCreditAction,
  reviewScanAction,
  saveRatesAction,
  savePaymentDetailsAction,
  confirmDeclaredInvoicesAction,
  sendInvoiceReminderAction,
  type BillingActionState,
} from "./billing-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";
import { matchLabel } from "@/lib/format";
import { DesktopSplit } from "@/components/ui/desktop-split";

const INITIAL: BillingActionState = { ok: false, message: "" };

const inputCls =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export default function BillingAdmin({
  seasonId,
  seasonName,
  period,
  periods,
  invoices,
  summary,
  rates,
  paymentDetails,
  pendingScans,
  outstandingInvoices,
  withdrawnWarnings,
  leftoverCredits,
  seasonEndDate,
  fund,
}: {
  seasonId: number;
  seasonName: string;
  period: string;
  periods: string[];
  invoices: Invoice[];
  summary: SeasonBillingSummary;
  rates: SeasonRates;
  paymentDetails: SeasonPaymentDetails;
  pendingScans: MultisportScan[];
  outstandingInvoices: Invoice[];
  withdrawnWarnings: WithdrawnInvoiceWarning[];
  leftoverCredits: LeftoverCredit[];
  seasonEndDate: string | null;
  /** Group fund panel; below the billing card, or in the right column on xl+. */
  fund?: React.ReactNode;
}) {
  const router = useRouter();
  const [genState, genAction, genPending] = useActionState(generateInvoicesAction, INITIAL);
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmDeclaredInvoicesAction,
    INITIAL,
  );

  useEffect(() => {
    if (genState.ok || confirmState.ok) router.refresh();
  }, [genState, confirmState, router]);

  return (
    <DesktopSplit
      aside={
        <>
          {/* xl+: rates and transfer details move next to the invoices. */}
          <section className="hidden rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm xl:mt-8 xl:block dark:border-white/10 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold">Billing settings</h2>
            <RatesForm seasonId={seasonId} rates={rates} compact />
            <PaymentDetailsForm seasonId={seasonId} details={paymentDetails} compact />
          </section>
          {fund}
        </>
      }
    >
    <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Subscription billing — {seasonName}</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Monthly amounts are the pitch cost for the month&apos;s Sundays split
        across the core group, due on the contract day. Core players owe this
        whether they play or not.
      </p>

      <div className="xl:hidden">
        <RatesForm seasonId={seasonId} rates={rates} />
        <PaymentDetailsForm seasonId={seasonId} details={paymentDetails} />
      </div>

      <form action={genAction} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="seasonId" value={seasonId} />
        <label>
          <span className="block text-xs text-neutral-500">Month</span>
          <input
            name="period"
            defaultValue={period}
            placeholder="2026-11"
            pattern="\d{4}-\d{2}"
            className={inputCls}
          />
        </label>
        <Button type="submit" pending={genPending} pendingLabel="Raising…">
          Raise invoices
        </Button>
      </form>
      <FeedbackMessage ok={genState.ok} message={genState.message} className="mt-2" />
      {invoices.some((invoice) => invoice.declaredPaidAt && !invoice.paidAt) ? (
        <form action={confirmAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="period" value={period} />
          <Button
            type="submit"
            variant="success"
            pending={confirmPending}
            pendingLabel="Confirming…"
          >
            Confirm all declared payments for {period}
          </Button>
          <FeedbackMessage ok={confirmState.ok} message={confirmState.message} />
        </form>
      ) : null}

      {periods.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {periods.map((p) => (
            <a
              key={p}
              href={`/admin/accounts?tab=billing&period=${p}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                p === period
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-black/10 text-neutral-600 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      ) : null}

      {summary.invoices > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Invoices" value={String(summary.invoices)} />
          <Stat label="Paid" value={`${summary.paid}/${summary.invoices}`} />
          <Stat label="Due" value={formatMinor(summary.dueMinor)} />
          <Stat label="Collected" value={formatMinor(summary.collectedMinor)} />
          <Stat label="Rounding" value={`+${formatMinor(summary.roundingMinor)}`} />
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No invoices for {period} yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5 dark:divide-white/10">
          {invoices.map((inv) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              ratesChangedAt={rates.ratesChangedAt}
            />
          ))}
        </ul>
      )}

      {withdrawnWarnings.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
          <h3 className="text-sm font-semibold">Withdrawn subscribers with open invoices</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {withdrawnWarnings.map((warning) => (
              <li key={`${warning.playerId}-${warning.period}`} className="flex justify-between gap-3">
                <span>{warning.name} · {warning.period}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatMinor(warning.totalMinor)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
            Withdrawing does not cancel invoices already raised.
          </p>
        </div>
      ) : null}

      <section className="mt-5 border-t border-black/5 pt-4 dark:border-white/5">
        <h3 className="text-sm font-medium">Who still owes</h3>
        {outstandingInvoices.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">All season invoices are confirmed paid.</p>
        ) : (
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {outstandingInvoices.map((invoice) => (
              <OutstandingInvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/5">
        <h3 className="text-sm font-medium">
          MultiSport scans to confirm
          {pendingScans.length > 0 ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              {pendingScans.length}
            </span>
          ) : null}
        </h3>
        {pendingScans.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing waiting.</p>
        ) : (
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {pendingScans.map((scan) => (
              <ScanRow key={scan.id} scan={scan} />
            ))}
          </ul>
        )}
      </div>

      {leftoverCredits.length > 0 ? (
        <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/5">
          <h3 className="text-sm font-medium">Unused MultiSport credit</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Approved credit comes off the player&apos;s next bill, only as much as the bill can
            take; the rest waits for the following one. When no bill is coming (withdrawn, or the
            season&apos;s last month is billed), refund it or move it to the group fund.
          </p>
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {leftoverCredits.map((credit) => (
              <LeftoverCreditRow
                key={credit.playerId}
                seasonId={seasonId}
                credit={credit}
                stranded={isCreditStranded({
                  withdrawn: credit.withdrawn,
                  seasonEndDate,
                  lastBilledPeriod: credit.lastBilledPeriod,
                })}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
    </DesktopSplit>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-2.5 text-center dark:border-white/10">
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );
}

function RatesForm({
  seasonId,
  rates,
  compact = false,
}: {
  seasonId: number;
  rates: SeasonRates;
  /** Narrow right-column layout used on xl+ screens. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveRatesAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const pln = (minor: number) => (minor / 100).toFixed(2);

  return (
    <details className="group mt-3 rounded-xl border border-black/10 bg-neutral-50/60 p-3 dark:border-white/10 dark:bg-neutral-800/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-sm font-medium">Rates &amp; pricing</span>
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className={compact ? "hidden" : "hidden sm:inline tabular-nums"}>
            Pitch {pln(rates.dayRateMinor)} · Extra player {pln(rates.guestRateMinor)} ·
            Extension {pln(rates.extensionCostMinor)}
          </span>
          <span className="rounded-lg border border-black/10 px-2 py-1 font-medium transition group-open:bg-neutral-200/60 dark:border-white/15 dark:group-open:bg-neutral-700/60">
            Edit
          </span>
        </span>
      </summary>
      <form
        action={formAction}
        className={compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-3 grid gap-2 sm:grid-cols-3"}
      >
        <input type="hidden" name="seasonId" value={seasonId} />
        <Field name="dayRate" label="Pitch per day (PLN)" defaultValue={pln(rates.dayRateMinor)} />
        <Field name="guestRate" label="Extra player (PLN)" defaultValue={pln(rates.guestRateMinor)} />
        <Field
          name="extensionCost"
          label="2-hour extension (PLN)"
          defaultValue={pln(rates.extensionCostMinor)}
        />
        <Field
          name="multisportCredit"
          label="MultiSport credit (PLN)"
          defaultValue={pln(rates.multisportCreditMinor)}
        />
        <Field
          name="paymentDueDay"
          label="Due day of month"
          defaultValue={String(rates.paymentDueDay)}
          type="number"
        />
        <Field
          name="extensionMinExtra"
          label="Extras needed to extend"
          defaultValue={String(rates.extensionMinExtra)}
          type="number"
        />
        <p className={`text-xs text-neutral-500 ${compact ? "col-span-2" : "sm:col-span-3"}`}>
          Applies to invoices and charges raised from now on. Anything already
          raised keeps the rate it was billed at.
        </p>
        <div className={compact ? "col-span-2" : "sm:col-span-3"}>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Saving…">
            Save rates
          </Button>
          <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
        </div>
      </form>
    </details>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500">{label}</span>
      <input
        name={name}
        type={type}
        inputMode="decimal"
        defaultValue={defaultValue}
        className={`${inputCls} w-full`}
      />
    </label>
  );
}

function PaymentDetailsForm({
  seasonId,
  details,
  compact = false,
}: {
  seasonId: number;
  details: SeasonPaymentDetails;
  /** Narrow right-column layout used on xl+ screens. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(savePaymentDetailsAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const filled = details.paymentName || details.paymentAccount;

  return (
    <details className="group mt-2 rounded-xl border border-black/10 bg-neutral-50/60 p-3 dark:border-white/10 dark:bg-neutral-800/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-sm font-medium">Where players send the money</span>
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          {!filled ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              not set
            </span>
          ) : (
            <span className={compact ? "hidden" : "hidden truncate sm:inline"}>{details.paymentName}</span>
          )}
          <span className="rounded-lg border border-black/10 px-2 py-1 font-medium dark:border-white/15">
            Edit
          </span>
        </span>
      </summary>
      <form
        action={formAction}
        className={compact ? "mt-3 grid gap-2" : "mt-3 grid gap-2 sm:grid-cols-2"}
      >
        <input type="hidden" name="seasonId" value={seasonId} />
        <label className="block">
          <span className="block text-xs text-neutral-500">Recipient name</span>
          <input
            name="paymentName"
            defaultValue={details.paymentName}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-xs text-neutral-500">Account / phone number</span>
          <input
            name="paymentAccount"
            defaultValue={details.paymentAccount}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-xs text-neutral-500">Method (BLIK, transfer…)</span>
          <input
            name="paymentMethod"
            defaultValue={details.paymentMethod}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-xs text-neutral-500">Pay-by-link URL (optional)</span>
          <input
            name="payLink"
            defaultValue={details.payLink}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className={compact ? "block" : "block sm:col-span-2"}>
          <span className="block text-xs text-neutral-500">Extra note for players</span>
          <textarea
            name="paymentNote"
            rows={2}
            defaultValue={details.paymentNote}
            className={`${inputCls} w-full`}
          />
        </label>
        <p className={compact ? "text-xs text-neutral-500" : "text-xs text-neutral-500 sm:col-span-2"}>
          Players see these on their Payments tab, with a copy button and the
          reference to put on the transfer.
        </p>
        <div className={compact ? undefined : "sm:col-span-2"}>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Saving…">
            Save transfer details
          </Button>
          <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
        </div>
      </form>
    </details>
  );
}

function OutstandingInvoiceRow({ invoice }: { invoice: Invoice }) {
  const [state, formAction, pending] = useActionState(sendInvoiceReminderAction, INITIAL);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div>
        <p className="font-medium">
          {invoice.name} · {invoice.period}
          {invoice.declaredPaidAt ? (
            <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              declared · confirm
            </span>
          ) : null}
        </p>
        <p className="text-xs text-neutral-500">
          Due {invoice.dueDate} · {formatMinor(invoice.totalMinor)}
        </p>
      </div>
      {invoice.declaredPaidAt ? (
        <span className="text-xs text-neutral-500">No reminder while awaiting confirmation</span>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Sending…">
            Remind
          </Button>
        </form>
      )}
      <FeedbackMessage ok={state.ok} message={state.message} className="basis-full" />
    </li>
  );
}

function InvoiceRow({
  invoice,
  ratesChangedAt,
}: {
  invoice: Invoice;
  ratesChangedAt: string | null;
}) {
  const router = useRouter();
  const [paidState, paidAction, paidPending] = useActionState(setInvoicePaidAction, INITIAL);
  const [daysState, daysAction, daysPending] = useActionState(setPlayingDaysAction, INITIAL);
  const [delState, delAction, delPending] = useActionState(deleteInvoiceAction, INITIAL);
  const [hideState, hideAction, hidePending] = useActionState(setInvoiceHiddenAction, INITIAL);
  const [editing, setEditing] = useState(false);
  const hidden = invoice.hiddenAt != null;

  useEffect(() => {
    if (paidState.ok || daysState.ok || delState.ok || hideState.ok) router.refresh();
  }, [paidState, daysState, delState, hideState, router]);

  return (
    <li className={`py-2.5 text-sm ${hidden ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {invoice.name}
            {hidden ? (
              <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                hidden from player
              </span>
            ) : null}
            {invoice.paidAt ? (
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                paid
              </span>
            ) : invoice.declaredPaidAt ? (
              <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                says sent · confirm
              </span>
            ) : (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                due {invoice.dueDate}
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            {invoice.playingDays} Sundays ÷ {invoice.splitBetween} ={" "}
            {formatMinor(invoice.grossMinor)}
            {invoice.roundingMinor > 0
              ? ` → ${formatMinor(invoice.chargedMinor)} (+${formatMinor(invoice.roundingMinor)})`
              : ""}
            {invoice.creditMinor > 0
              ? ` · MultiSport −${formatMinor(invoice.creditMinor)}`
              : ""}
          </p>
          {ratesChangedAt &&
          invoice.createdAt &&
          Date.parse(invoice.createdAt) < Date.parse(ratesChangedAt) ? (
            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
              Rates changed on {new Date(ratesChangedAt).toLocaleDateString()}; this invoice keeps its original snapshot.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{formatMinor(invoice.totalMinor)}</span>
          <form action={paidAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="paid" value={invoice.paidAt ? "false" : "true"} />
            <Button
              type="submit"
              variant={invoice.paidAt ? "secondary" : "success"}
              pending={paidPending}
              pendingLabel="…"
            >
              {invoice.paidAt ? "Undo" : "Mark paid"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="text-xs text-neutral-500 underline underline-offset-2"
          >
            Manage
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800/50">
          <form action={daysAction} className="flex items-end gap-2">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label>
              <span className="block text-xs text-neutral-500">Playing days</span>
              <input
                name="playingDays"
                type="number"
                min={0}
                max={6}
                defaultValue={invoice.playingDays}
                className={`${inputCls} w-24`}
              />
            </label>
            <Button type="submit" variant="secondary" pending={daysPending} pendingLabel="…">
              Recalculate
            </Button>
          </form>
          <form action={hideAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
            <Button type="submit" variant="secondary" pending={hidePending} pendingLabel="…">
              {hidden ? "Show to player" : "Hide from player"}
            </Button>
          </form>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!window.confirm(`Delete ${invoice.name}'s ${invoice.period} invoice? This can't be undone.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <Button type="submit" variant="danger" pending={delPending} pendingLabel="…">
              Delete
            </Button>
          </form>
          <p className="w-full text-xs text-neutral-500">
            Hidden invoices disappear from the player&apos;s Payments and Home, get no
            reminders and drop out of &ldquo;Who still owes&rdquo;. MultiSport credit on an
            unpaid hidden bill goes back to the player&apos;s next bill.
          </p>
        </div>
      ) : null}

      <FeedbackMessage ok={daysState.ok} message={daysState.message} className="mt-1" />
      <FeedbackMessage ok={hideState.ok} message={hideState.message} className="mt-1" />
      <FeedbackMessage ok={delState.ok} message={delState.message} className="mt-1" />
    </li>
  );
}

function LeftoverCreditRow({
  seasonId,
  credit,
  stranded,
}: {
  seasonId: number;
  credit: LeftoverCredit;
  stranded: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(settleLeftoverCreditAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const confirmText = (as: "refunded" | "fund") => {
    const what =
      as === "fund"
        ? `Move ${formatMinor(credit.creditMinor)} of ${credit.name}'s credit into the group fund?`
        : `Mark ${formatMinor(credit.creditMinor)} as refunded to ${credit.name}? Pay it back to them yourself.`;
    return stranded ? what : `${what}\n\nIt would otherwise come off their next bill.`;
  };

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {credit.name}
            {stranded ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                {credit.withdrawn ? "withdrawn · no more bills" : "no more bills"}
              </span>
            ) : (
              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                next bill
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            {credit.scans} scan{credit.scans === 1 ? "" : "s"} · {formatMinor(credit.creditMinor)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["refunded", "fund"] as const).map((as) => (
            <form
              key={as}
              action={formAction}
              onSubmit={(e) => {
                if (!window.confirm(confirmText(as))) e.preventDefault();
              }}
            >
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="playerId" value={credit.playerId} />
              <input type="hidden" name="name" value={credit.name} />
              <input type="hidden" name="as" value={as} />
              <Button type="submit" variant="secondary" pending={pending} pendingLabel="…">
                {as === "fund" ? "To group fund" : "Refunded"}
              </Button>
            </form>
          ))}
        </div>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-1" />
    </li>
  );
}

function ScanRow({ scan }: { scan: MultisportScan }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(reviewScanAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div>
        <p className="font-medium">{scan.name}</p>
        <p className="text-xs text-neutral-500">
          {matchLabel(scan.playedOn)} · −{formatMinor(scan.creditMinor)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="scanId" value={scan.id} />
          <input type="hidden" name="approve" value="true" />
          <Button type="submit" variant="success" pending={pending} pendingLabel="…">
            Approve
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="scanId" value={scan.id} />
          <input type="hidden" name="approve" value="false" />
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="…">
            Reject
          </Button>
        </form>
      </div>
    </li>
  );
}
