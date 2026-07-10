"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  playerSetPaidAction,
  playerSetGuestPaidAction,
  type PaymentActionState,
} from "./actions";
import type { PlayerPaymentMatch } from "@/lib/payments";
import { fmtDate } from "@/lib/matches";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: PaymentActionState = { ok: false, message: "" };

function useRefreshOnOk(state: PaymentActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SelfPaidToggle({ matchId, paid }: { matchId: number; paid: boolean }) {
  const [state, action, pending] = useActionState(playerSetPaidAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      <Button
        type="submit"
        variant={paid ? "secondary" : "success"}
        pending={pending}
        pendingLabel="Saving…"
      >
        {paid ? "Mark as not paid" : "I've paid"}
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
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
  const [state, action, pending] = useActionState(playerSetGuestPaidAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="guestId" value={guestId} />
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      <Button
        type="submit"
        size="sm"
        variant={paid ? "secondary" : "success"}
        pending={pending}
        pendingLabel="Saving…"
      >
        {paid ? "Not paid" : "Paid"}
      </Button>
    </form>
  );
}

function MatchCard({ m }: { m: PlayerPaymentMatch }) {
  const guestsOwed = m.guests.length * m.share;
  const myOwed = m.inRoster ? m.share : 0;
  const total = myOwed + guestsOwed;

  return (
    <div className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Match {m.matchId}</h2>
          <p className="text-sm text-neutral-500">{fmtDate(m.playedOn)}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-neutral-500">You owe</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
      </div>

      {m.inRoster ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div>
            <p className="text-sm font-medium">Your share</p>
            <p className="text-xs text-neutral-500">{m.share} for you</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={m.paid ? "success" : "warning"}>{m.paid ? "Paid" : "Not paid"}</Badge>
            <SelfPaidToggle matchId={m.matchId} paid={m.paid} />
          </div>
        </div>
      ) : null}

      {m.guests.length > 0 ? (
        <div className="mt-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
          <p className="text-sm font-medium">Your guests</p>
          <ul className="mt-2 space-y-2">
            {m.guests.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {g.name} <span className="text-neutral-500">· {m.share}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={g.paid ? "success" : "warning"}>{g.paid ? "Paid" : "Not paid"}</Badge>
                  <GuestPaidToggle matchId={m.matchId} guestId={g.id} paid={g.paid} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {m.paymentName || m.paymentMobile || m.paymentMethod || m.paymentNote ? (
        <div className="mt-3 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
          <p className="text-sm font-medium">Where to send it</p>
          <div className="mt-2 space-y-1">
            <DetailRow label="Recipient" value={m.paymentName} />
            <DetailRow label="Mobile" value={m.paymentMobile} />
            <DetailRow label="Method" value={m.paymentMethod} />
            <DetailRow label="Note" value={m.paymentNote} />
          </div>
        </div>
      ) : null}
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
    <div className="mt-6 space-y-4">
      {matches.map((m) => (
        <MatchCard key={m.matchId} m={m} />
      ))}
    </div>
  );
}
