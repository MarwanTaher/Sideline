"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MatchdaySettlement } from "@/lib/season-fund";
import { formatMinor } from "@/lib/format-money";
import { recordSettlementAction, type FundActionState } from "./fund-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: FundActionState = { ok: false, message: "" };
const inputCls =
  "mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

/**
 * P2.3: the expected facility bill for this matchday next to what the group
 * actually paid, with a warning when the facility counted different scans.
 */
export default function MatchdaySettlementCard({
  matchId,
  settlement,
}: {
  matchId: number;
  settlement: MatchdaySettlement;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(recordSettlementAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const rec = settlement.recorded;
  const difference = rec ? rec.expectedMinor - rec.paidMinor : 0;
  const scanMismatch = rec?.facilityScans != null && rec.facilityScans !== rec.approvedScans;
  const stale = rec != null && rec.expectedMinor !== settlement.expectedMinor;

  return (
    <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Facility payment (admin)</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Expected bill {formatMinor(settlement.expectedMinor)}: day rate, plus the extension if
        confirmed, less {settlement.approvedScans} approved MultiSport scan
        {settlement.approvedScans === 1 ? "" : "s"}. Record what was actually paid; any
        difference goes to the group fund.
      </p>

      {rec ? (
        <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-800/50">
          <p>
            Paid <span className="font-semibold tabular-nums">{formatMinor(rec.paidMinor)}</span> of{" "}
            {formatMinor(rec.expectedMinor)} expected
            {difference !== 0 ? (
              <span className={difference > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}>
                {" "}
                · {difference > 0 ? "+" : ""}
                {formatMinor(difference)} to the fund
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Recorded by {rec.recordedBy || "an admin"}
            {rec.note ? ` · ${rec.note}` : ""}
          </p>
        </div>
      ) : null}

      {scanMismatch ? (
        <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          The facility counted {rec!.facilityScans} scan{rec!.facilityScans === 1 ? "" : "s"}, but{" "}
          {rec!.approvedScans} {rec!.approvedScans === 1 ? "is" : "are"} approved here. A scan was
          probably missed or reported wrongly.
        </p>
      ) : null}
      {stale ? (
        <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Scans or the extension changed since this was recorded (now {formatMinor(settlement.expectedMinor)}).
          Record it again to update the expected bill.
        </p>
      ) : null}

      <form action={action} className="mt-3 grid gap-2 sm:grid-cols-3">
        <input type="hidden" name="matchId" value={matchId} />
        <label className="text-sm">
          <span className="text-xs text-neutral-500">Paid to the facility (PLN)</span>
          <input
            name="paid"
            inputMode="decimal"
            defaultValue={((rec?.paidMinor ?? settlement.expectedMinor) / 100).toFixed(2)}
            className={inputCls}
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-neutral-500">Scans the facility counted</span>
          <input
            name="facilityScans"
            type="number"
            min={0}
            defaultValue={rec?.facilityScans ?? ""}
            className={inputCls}
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-neutral-500">Note</span>
          <input name="note" maxLength={300} defaultValue={rec?.note ?? ""} className={inputCls} />
        </label>
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Saving…">
            {rec ? "Update facility payment" : "Record facility payment"}
          </Button>
          <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
        </div>
      </form>
    </section>
  );
}
