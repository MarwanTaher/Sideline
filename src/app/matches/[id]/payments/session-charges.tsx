"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GuestCharge, MatchChargeContext } from "@/lib/season-fund";
import { formatMinor } from "@/lib/format-money";
import {
  setExtendedAction,
  setChargePaidAction,
  setChargeKindAction,
  deleteChargeAction,
  markScanRefundedAction,
  type FundActionState,
} from "./fund-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: FundActionState = { ok: false, message: "" };

export default function SessionCharges({
  context,
  charges,
  subscribers,
}: {
  context: MatchChargeContext;
  charges: GuestCharge[];
  subscribers: { playerId: number; name: string }[];
}) {
  const router = useRouter();
  const [extState, extAction, extPending] = useActionState(setExtendedAction, INITIAL);

  useEffect(() => {
    if (extState.ok) router.refresh();
  }, [extState, router]);

  const extras = charges.filter((c) => c.kind === "extra");
  const collected = extras
    .filter((c) => c.paidAt)
    .reduce((sum, c) => sum + c.amountMinor, 0);
  const expected = extras.reduce((sum, c) => sum + c.amountMinor, 0);
  const shortfall = context.extended ? context.extensionCostMinor - expected : 0;
  const tooFewForExtension =
    context.extended && context.extraCount < context.extensionMinExtra;

  return (
    <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Session charges (admin)</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Core subscribers are covered by their monthly payment. Everyone else pays{" "}
        {formatMinor(context.guestRateMinor)}
        {context.newRules
          ? " to the group. A replacement from a seat swap credits that subscriber's next bill once paid."
          : " — to the group if they're an extra player, or to the subscriber they're covering for."}
      </p>

      <form action={extAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="matchId" value={context.matchId} />
        <input type="hidden" name="extended" value={context.extended ? "false" : "true"} />
        <Button
          type="submit"
          variant={context.extended ? "secondary" : "primary"}
          pending={extPending}
          pendingLabel="…"
          disabled={!context.extended && (context.extensionMinutes === 0 || (context.extensionThreshold != null && context.squadCount < context.extensionThreshold))}
        >
          {context.extended ? "Remove optional extension" : `Extend to ${context.baseMinutes + context.extensionMinutes} minutes`}
        </Button>
        <span className="text-xs text-neutral-500">
          Base {context.baseMinutes} min; optional +{context.extensionMinutes} min.
          {" "}Costs {formatMinor(context.extensionCostMinor)} · needs{" "}
          {context.extensionMinExtra}+ extra players
          {context.extensionThreshold != null ? `; ${context.squadCount}/${context.extensionThreshold} participants confirmed` : ""}
        </span>
      </form>
      <FeedbackMessage ok={extState.ok} message={extState.message} className="mt-2" />
      {context.extended && context.extensionThreshold != null && context.squadCount < context.extensionThreshold ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Attendance dropped after confirmation. Review the booking; its cost has not been automatically reversed.</p>
      ) : null}

      {tooFewForExtension ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Only {context.extraCount} extra player
          {context.extraCount === 1 ? "" : "s"} — the extension costs{" "}
          {formatMinor(context.extensionCostMinor)} but raises{" "}
          {formatMinor(expected)}. The fund covers the{" "}
          {formatMinor(Math.max(0, shortfall))} difference.
        </p>
      ) : null}

      {context.uncharged > 0 || context.stale > 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          {[
            context.uncharged > 0
              ? `${context.uncharged} player${context.uncharged === 1 ? "" : "s"} still to charge`
              : "",
            context.stale > 0
              ? `${context.stale} unpaid charge${context.stale === 1 ? "" : "s"} no longer playing`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          {" "}— charges are synced automatically when the matchday is closed.
        </p>
      ) : null}

      {charges.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          No non-core players in this match.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="To the fund" value={formatMinor(expected)} />
            <Stat label="Collected" value={formatMinor(collected)} />
            <Stat
              label={context.extended ? "Net after extension" : "Net"}
              value={formatMinor(collected - (context.extended ? context.extensionCostMinor : 0))}
            />
          </div>

          <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10">
            {charges.map((charge) => (
              <ChargeRow
                key={charge.id}
                charge={charge}
                matchId={context.matchId}
                subscribers={subscribers}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-2.5 dark:border-white/10">
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );
}

function ChargeRow({
  charge,
  matchId,
  subscribers,
}: {
  charge: GuestCharge;
  matchId: number;
  subscribers: { playerId: number; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [paidState, paidAction, paidPending] = useActionState(setChargePaidAction, INITIAL);
  const [kindState, kindAction, kindPending] = useActionState(setChargeKindAction, INITIAL);
  const [delState, delAction, delPending] = useActionState(deleteChargeAction, INITIAL);
  const [refundState, refundAction, refundPending] = useActionState(markScanRefundedAction, INITIAL);

  useEffect(() => {
    if (paidState.ok || kindState.ok || delState.ok || refundState.ok) router.refresh();
  }, [paidState, kindState, delState, refundState, router]);

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {charge.name}
            {charge.guestId != null ? (
              <span className="ml-2 text-xs text-neutral-400">guest</span>
            ) : null}
          </p>
          <p className="text-xs text-neutral-500">
            {charge.kind === "replacement"
              ? charge.newRules
                ? `Pays the group · ${charge.owedToName ?? "the subscriber"} gets ${formatMinor(charge.amountMinor)} off their next bill once paid`
                : `Pays ${charge.owedToName ?? "a subscriber"} directly`
              : "Pays the group fund"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">
            {formatMinor(charge.payableMinor)}
            {charge.scanCreditMinor > 0 ? (
              <span className="ml-1 text-xs font-normal text-neutral-500">
                (MultiSport −{formatMinor(charge.scanCreditMinor)})
              </span>
            ) : null}
          </span>
          <form action={paidAction}>
            <input type="hidden" name="chargeId" value={charge.id} />
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="paid" value={charge.paidAt ? "false" : "true"} />
            <Button
              type="submit"
              variant={charge.paidAt ? "secondary" : "success"}
              pending={paidPending}
              pendingLabel="…"
            >
              {charge.paidAt ? "Paid" : "Mark paid"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-neutral-500 underline underline-offset-2"
          >
            Change
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800/50">
          <form action={kindAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="chargeId" value={charge.id} />
            <input type="hidden" name="matchId" value={matchId} />
            <label>
              <span className="block text-xs text-neutral-500">They are</span>
              <select
                name="kind"
                defaultValue={charge.kind}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
              >
                <option value="extra">An extra player (pays the fund)</option>
                <option value="replacement">Covering for a subscriber</option>
              </select>
            </label>
            <label>
              <span className="block text-xs text-neutral-500">Covering for</span>
              <select
                name="owedToPlayerId"
                defaultValue={charge.owedToPlayerId ?? ""}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
              >
                <option value="">—</option>
                {subscribers.map((s) => (
                  <option key={s.playerId} value={s.playerId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary" pending={kindPending} pendingLabel="…">
              Save
            </Button>
          </form>
          <form action={delAction}>
            <input type="hidden" name="chargeId" value={charge.id} />
            <input type="hidden" name="matchId" value={matchId} />
            <Button type="submit" variant="danger" pending={delPending} pendingLabel="…">
              Remove
            </Button>
          </form>
        </div>
      ) : null}

      {charge.refundDueMinor > 0 ? (
        <form action={refundAction} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <input type="hidden" name="chargeId" value={charge.id} />
          <input type="hidden" name="matchId" value={matchId} />
          <span>
            Paid in full before the MultiSport scan was approved: refund{" "}
            {formatMinor(charge.refundDueMinor)} to {charge.name}.
          </span>
          <Button type="submit" size="sm" variant="secondary" pending={refundPending} pendingLabel="…">
            Refunded
          </Button>
        </form>
      ) : null}
      <FeedbackMessage ok={kindState.ok} message={kindState.message} className="mt-1" />
      <FeedbackMessage ok={paidState.ok} message={paidState.ok ? "" : paidState.message} className="mt-1" />
      <FeedbackMessage ok={refundState.ok} message={refundState.message} className="mt-1" />
    </li>
  );
}
