"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Invoice, SeasonBillingSummary, SeasonRates } from "@/lib/season-billing";
import type { MultisportScan } from "@/lib/multisport";
import { formatMinor } from "@/lib/format-money";
import {
  generateInvoicesAction,
  setInvoicePaidAction,
  setPlayingDaysAction,
  deleteInvoiceAction,
  reviewScanAction,
  saveRatesAction,
  type BillingActionState,
} from "./billing-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";
import { matchLabel } from "@/lib/format";

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
  pendingScans,
}: {
  seasonId: number;
  seasonName: string;
  period: string;
  periods: string[];
  invoices: Invoice[];
  summary: SeasonBillingSummary;
  rates: SeasonRates;
  pendingScans: MultisportScan[];
}) {
  const router = useRouter();
  const [genState, genAction, genPending] = useActionState(generateInvoicesAction, INITIAL);

  useEffect(() => {
    if (genState.ok) router.refresh();
  }, [genState, router]);

  return (
    <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Subscription billing — {seasonName}</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Monthly amounts are the pitch cost for the month&apos;s Sundays split
        across the core group, due on the contract day. Core players owe this
        whether they play or not.
      </p>

      <RatesForm seasonId={seasonId} rates={rates} />

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

      {periods.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {periods.map((p) => (
            <a
              key={p}
              href={`/admin/accounts?period=${p}`}
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
            <InvoiceRow key={inv.id} invoice={inv} />
          ))}
        </ul>
      )}

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
    </section>
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

function RatesForm({ seasonId, rates }: { seasonId: number; rates: SeasonRates }) {
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
          <span className="hidden sm:inline tabular-nums">
            Pitch {pln(rates.dayRateMinor)} · Extra player {pln(rates.guestRateMinor)} ·
            Extension {pln(rates.extensionCostMinor)}
          </span>
          <span className="rounded-lg border border-black/10 px-2 py-1 font-medium transition group-open:bg-neutral-200/60 dark:border-white/15 dark:group-open:bg-neutral-700/60">
            Edit
          </span>
        </span>
      </summary>
      <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-3">
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
        <p className="text-xs text-neutral-500 sm:col-span-3">
          Applies to invoices and charges raised from now on. Anything already
          raised keeps the rate it was billed at.
        </p>
        <div className="sm:col-span-3">
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

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const [paidState, paidAction, paidPending] = useActionState(setInvoicePaidAction, INITIAL);
  const [daysState, daysAction, daysPending] = useActionState(setPlayingDaysAction, INITIAL);
  const [delState, delAction, delPending] = useActionState(deleteInvoiceAction, INITIAL);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (paidState.ok || daysState.ok || delState.ok) router.refresh();
  }, [paidState, daysState, delState, router]);

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {invoice.name}
            {invoice.paidAt ? (
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                paid
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
            className="text-xs text-neutral-500 underline underline-offset-2"
          >
            Adjust
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
          <form action={delAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <Button type="submit" variant="danger" pending={delPending} pendingLabel="…">
              Delete
            </Button>
          </form>
        </div>
      ) : null}

      <FeedbackMessage ok={daysState.ok} message={daysState.message} className="mt-1" />
      <FeedbackMessage ok={delState.ok} message={delState.message} className="mt-1" />
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
