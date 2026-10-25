"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FundBalance, FundAdjustment } from "@/lib/season-fund";
import type { RoundingLine } from "@/lib/season-billing";
import { formatMinor } from "@/lib/format-money";
import {
  addAdjustmentAction,
  deleteAdjustmentAction,
  type FundActionState,
} from "@/app/matches/[id]/payments/fund-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: FundActionState = { ok: false, message: "" };

const inputCls =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export default function FundAdmin({
  seasonId,
  balance,
  adjustments,
  roundingLines,
}: {
  seasonId: number;
  balance: FundBalance;
  adjustments: FundAdjustment[];
  roundingLines: RoundingLine[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addAdjustmentAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Group fund</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Built from extra players&apos; session fees and the rounding on monthly
        bills, less what the 2-hour extensions cost. It exists to absorb an
        unfilled core place or a session the group still has to pay for.
      </p>

      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-3 text-center dark:bg-emerald-950/20">
        <p className="text-2xl font-bold tabular-nums">
          {formatMinor(balance.balanceMinor)}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
          Current balance
        </p>
      </div>

      <ul className="mt-3 divide-y divide-black/5 text-sm dark:divide-white/10">
        <Line label="Extra players' fees (paid)" value={balance.guestFeesMinor} />
        <Line label="Rounding on paid bills" value={balance.roundingMinor} />
        <Line label="2-hour extensions" value={-balance.extensionCostMinor} />
        <Line label="Manual adjustments" value={balance.adjustmentsMinor} />
      </ul>

      {balance.guestFeesOutstandingMinor > 0 ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {formatMinor(balance.guestFeesOutstandingMinor)} of session fees still
          uncollected — not counted above.
        </p>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="seasonId" value={seasonId} />
        <label>
          <span className="block text-xs text-neutral-500">Amount (PLN)</span>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="-50"
            className={`${inputCls} w-28`}
          />
        </label>
        <label className="min-w-48 flex-1">
          <span className="block text-xs text-neutral-500">What for</span>
          <input name="note" maxLength={120} placeholder="Covered unfilled place" className={`${inputCls} w-full`} />
        </label>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Saving…">
          Record
        </Button>
      </form>
      <p className="mt-1 text-xs text-neutral-500">
        Negative spends from the fund; positive adds to it.
      </p>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />

      {adjustments.length > 0 ? (
        <ul className="mt-3 divide-y divide-black/5 text-sm dark:divide-white/10">
          {adjustments.map((adj) => (
            <AdjustmentRow key={adj.id} adjustment={adj} />
          ))}
        </ul>
      ) : null}

      {roundingLines.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-neutral-400">
            Rounding by month
          </summary>
          <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/10">
            {roundingLines.map((line) => (
              <li key={line.period} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {line.period}
                  <span className="ml-2 text-xs text-neutral-500">
                    {line.invoices} invoice{line.invoices === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="tabular-nums">
                  +{formatMinor(line.roundingMinor)}
                  <span className="ml-2 text-xs text-neutral-500">
                    ({formatMinor(line.collectedMinor)} in)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
      <span
        className={`tabular-nums ${
          value < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {value < 0 ? "−" : "+"}
        {formatMinor(Math.abs(value))}
      </span>
    </li>
  );
}

function AdjustmentRow({ adjustment }: { adjustment: FundAdjustment }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteAdjustmentAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate">{adjustment.note}</p>
        <p className="text-xs text-neutral-500">
          {new Date(adjustment.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`tabular-nums ${
            adjustment.amountMinor < 0
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {adjustment.amountMinor < 0 ? "−" : "+"}
          {formatMinor(Math.abs(adjustment.amountMinor))}
        </span>
        <form action={formAction}>
          <input type="hidden" name="id" value={adjustment.id} />
          <Button type="submit" variant="danger" pending={pending} pendingLabel="…">
            Remove
          </Button>
        </form>
      </div>
    </li>
  );
}
