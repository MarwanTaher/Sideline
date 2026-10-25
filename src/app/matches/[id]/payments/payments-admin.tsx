"use client";

import { useEffect, useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetUnpaidAction,
  saveDetailsAction,
  saveTotalAction,
  togglePaidAction,
  toggleGuestPaidAction,
  setPaymentsActiveAction,
  type PaymentActionState,
} from "./actions";
import { sendPaymentReminderAction } from "@/app/actions/push";
import type {
  PaymentMeta,
  PaymentRow,
  PaymentSummary,
} from "@/lib/payments";
import type { Guest } from "@/lib/guests-shared";
import { PAYMENT_CURRENCIES, formatAmount } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: PaymentActionState = { ok: false, message: "" };

const inputCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

function useRefreshOnOk(state: PaymentActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

function TotalForm({ matchId, total, currency }: { matchId: number; total: number; currency: string }) {
  const [state, action, pending] = useActionState(saveTotalAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <input type="hidden" name="matchId" value={matchId} />
      <label className="block text-sm">
        <span className="font-medium">Total cost for this match day ({currency})</span>
        <input type="number" name="total" min={0} step={1} defaultValue={total} className={inputCls} />
      </label>
      <Button type="submit" className="mt-3" pending={pending} pendingLabel="Saving…">
        Save total
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </form>
  );
}

function ActivateForm({ matchId, active }: { matchId: number; active: boolean }) {
  const [state, action, pending] = useActionState(setPaymentsActiveAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form
      action={action}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <div>
        <p className="text-sm font-medium">Self-service payments</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {active
            ? "Players can see their share and mark themselves paid on their Payments tab."
            : "Closed — players cannot see or update payments for this match."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={active ? "success" : "neutral"}>{active ? "Open" : "Closed"}</Badge>
        <Button
          type="submit"
          variant={active ? "secondary" : "success"}
          pending={pending}
          pendingLabel="Saving…"
        >
          {active ? "Close payments" : "Open for players"}
        </Button>
      </div>
    </form>
  );
}

function DetailsForm({ matchId, meta }: { matchId: number; meta: PaymentMeta }) {
  const [state, action, pending] = useActionState(saveDetailsAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-sm font-medium">Payment details</p>
      <p className="mt-0.5 text-xs text-neutral-500">Shown to players so they know where to send money.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Currency</span>
          <select name="currency" defaultValue={meta.currency} className={inputCls}>
            {PAYMENT_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">New matches keep the last currency you used.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Recipient name</span>
          <input type="text" name="name" defaultValue={meta.paymentName} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Phone / account number</span>
          <input type="text" name="mobile" defaultValue={meta.paymentMobile} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Payment method (Blik, Revolut, PayPal…)</span>
          <input type="text" name="method" defaultValue={meta.paymentMethod} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Additional note (optional)</span>
          <input type="text" name="note" defaultValue={meta.paymentNote} className={inputCls} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">Payment link (optional)</span>
          <input
            type="url"
            name="payLink"
            inputMode="url"
            placeholder="https://revolut.me/…  or  https://paypal.me/…"
            defaultValue={meta.payLink}
            className={inputCls}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Players get a one-tap Pay button with their exact amount, plus copy buttons for every
            detail and a ready-made reference.
          </span>
        </label>
      </div>
      <Button type="submit" className="mt-3" pending={pending} pendingLabel="Saving…">
        Save payment details
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </form>
  );
}

function PaidToggle({
  matchId,
  playerId,
  paid,
}: {
  matchId: number;
  playerId: number;
  paid: boolean;
}) {
  const [state, action, pending] = useActionState(togglePaidAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      <Button
        type="submit"
        size="sm"
        variant={paid ? "success" : "secondary"}
        className="min-h-9"
        pending={pending}
        pendingLabel="Saving…"
      >
        {paid ? "Paid" : "Mark paid"}
      </Button>
    </form>
  );
}

function GuestPaidToggle({
  matchId,
  guestId,
  paid,
}: {
  matchId: number;
  guestId: number;
  paid: boolean;
}) {
  const [state, action, pending] = useActionState(toggleGuestPaidAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="guestId" value={guestId} />
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      <Button
        type="submit"
        size="sm"
        variant={paid ? "success" : "secondary"}
        className="min-h-9"
        pending={pending}
        pendingLabel="Saving…"
      >
        {paid ? "Paid" : "Mark paid"}
      </Button>
    </form>
  );
}

function ResetForm({ matchId }: { matchId: number }) {
  const [state, action, pending] = useActionState(resetUnpaidAction, INITIAL);
  const [confirm, setConfirm] = useState("");
  useRefreshOnOk(state);
  const confirmed = confirm.trim().toUpperCase() === "RESET";
  return (
    <form action={action} className="rounded-xl border border-red-500/30 p-4">
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-sm font-medium text-red-700 dark:text-red-300">
        Reset all payments to unpaid
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        This clears every player&apos;s paid status for this match day. Type{" "}
        <span className="font-mono font-semibold">RESET</span> to confirm.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="RESET"
          autoComplete="off"
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
        />
        <Button
          type="submit"
          variant="danger"
          disabled={!confirmed}
          pending={pending}
          pendingLabel="Resetting…"
        >
          Reset all to unpaid
        </Button>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function ReminderButton({
  matchId,
  unpaidCount,
}: {
  matchId: number;
  unpaidCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={pending || unpaidCount === 0}
        onClick={() => {
          setMessage("");
          startTransition(async () => {
            const res = await sendPaymentReminderAction(matchId);
            setMessage(res.message);
          });
        }}
      >
        {pending ? "Sending…" : "Send payment reminder"}
      </Button>
      {message ? (
        <span className="text-sm text-neutral-500">{message}</span>
      ) : null}
    </div>
  );
}

export function PaymentsAdmin({
  selectedMatchId,
  meta,
  rows,
  guests,
  summary,
  totalChange,
}: {
  selectedMatchId: number;
  meta: PaymentMeta;
  rows: PaymentRow[];
  guests: Guest[];
  summary: PaymentSummary;
  totalChange: number;
}) {
  const money = (n: number) => formatAmount(n, meta.currency);
  return (
    <div className="mt-6 space-y-6">
      <ActivateForm matchId={selectedMatchId} active={meta.paymentsActive} />
      <TotalForm matchId={selectedMatchId} total={meta.totalPayment} currency={meta.currency} />
      <DetailsForm matchId={selectedMatchId} meta={meta} />
      {rows.length === 0 && guests.length === 0 ? (
        <p className="text-sm text-neutral-500">No players in this match.</p>
      ) : (
        <div>
          <div className="flex flex-wrap gap-6">
            <Metric label="Total" value={summary.totalPlayers} />
            <Metric label="Paid" value={summary.paidCount} />
            <Metric label="Unpaid" value={summary.unpaidCount} />
            <Metric label="Per player share" value={money(summary.sharePerPlayer)} />
            <Metric label="Remaining" value={money(summary.remaining)} />
            <Metric label="Change (this match)" value={money(summary.changeCollected)} />
            <Metric label="Change (all matches)" value={totalChange} />
          </div>

          <div className="mt-4">
            <ReminderButton
              matchId={selectedMatchId}
              unpaidCount={summary.unpaidCount}
            />
          </div>

          <DataTable className="mt-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th scope="col" className="py-2 pr-4">Player</th>
                  <th scope="col" className="py-2 pr-4">Team</th>
                  <th scope="col" className="py-2 pr-4">Share</th>
                  <th scope="col" className="py-2 pr-4">Paid</th>
                  <th scope="col" className="py-2 pr-4">Last update</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.playerId} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.teamNo}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{money(summary.sharePerPlayer)}</td>
                    <td className="py-2 pr-4">
                      <PaidToggle matchId={selectedMatchId} playerId={r.playerId} paid={r.paid} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">{r.updatedAt ?? "—"}</td>
                  </tr>
                ))}
                {guests.map((g) => (
                  <tr key={`g-${g.id}`} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">
                      <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        Guest
                      </span>
                      {g.name}
                      <span className="text-xs text-neutral-500"> · of {g.hostName}</span>
                    </td>
                    <td className="py-2 pr-4">{g.teamNo ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{money(summary.sharePerPlayer)}</td>
                    <td className="py-2 pr-4">
                      <GuestPaidToggle matchId={selectedMatchId} guestId={g.id} paid={g.paid} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <p className="mt-3 text-xs text-neutral-500">
            Collected so far: {money(summary.collected)} / {money(Math.trunc(meta.totalPayment))}
            {summary.changeCollected > 0
              ? ` · +${money(summary.changeCollected)} extra from rounding`
              : ""}
          </p>
          <div className="mt-3">
            <ResetForm matchId={selectedMatchId} />
          </div>
        </div>
      )}
    </div>
  );
}
