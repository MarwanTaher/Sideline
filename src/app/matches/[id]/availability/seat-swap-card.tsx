"use client";

import { useActionState } from "react";
import type { SeatSwapCardData } from "@/lib/seat-offers";
import { formatMinor } from "@/lib/format-money";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";
import {
  approveSeatRequestAction,
  cancelSeatRequestAction,
  postSeatOfferAction,
  requestSeatAction,
  withdrawSeatOfferAction,
  type SeatOfferActionState,
} from "./seat-offer-actions";

const INITIAL: SeatOfferActionState = { ok: false, message: "" };

type SeatAction = (
  prev: SeatOfferActionState,
  formData: FormData,
) => Promise<SeatOfferActionState>;

function SeatActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = "primary",
}: {
  action: SeatAction;
  fields: Record<string, number>;
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="sm" variant={variant} pending={pending} pendingLabel={pendingLabel}>
        {label}
      </Button>
      {state.ok ? null : <FeedbackMessage ok={false} message={state.message} className="text-xs" />}
    </form>
  );
}

function PaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
      paid
    </span>
  ) : (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
      unpaid
    </span>
  );
}

const rowClass =
  "flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10";

function SubscriberView({ data }: { data: SeatSwapCardData }) {
  const offer = data.myOffer;

  if (!offer) {
    return (
      <div className={rowClass}>
        <p className="text-neutral-600 dark:text-neutral-300">
          Can&apos;t make it? Offer your seat to the waitlist — you pick who gets it and they pay
          you {formatMinor(data.rateMinor)}.
        </p>
        <SeatActionButton
          action={postSeatOfferAction}
          fields={{ matchId: data.matchId }}
          label="Offer seat"
          pendingLabel="Offering…"
        />
      </div>
    );
  }

  if (offer.status === "filled") {
    return (
      <div className={rowClass}>
        <p>
          <span className="font-medium">{offer.replacementName ?? "Your replacement"}</span> has your
          seat and pays you{" "}
          <span className="font-medium">{formatMinor(offer.chargeMinor ?? data.rateMinor)}</span>.
        </p>
        <PaidBadge paid={offer.chargePaid} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={rowClass}>
        <p className="text-neutral-600 dark:text-neutral-300">
          Your seat is offered.{" "}
          {offer.requests.length === 0 ? "No requests yet." : "Pick who gets it:"}
        </p>
        <SeatActionButton
          action={withdrawSeatOfferAction}
          fields={{ offerId: offer.offerId }}
          label="Withdraw"
          pendingLabel="Withdrawing…"
          variant="secondary"
        />
      </div>
      {offer.requests.length > 0 ? (
        <ul className="space-y-2">
          {offer.requests.map((r) => (
            <li key={r.playerId} className={rowClass}>
              <span className="truncate font-medium">{r.name}</span>
              {data.windowOpen ? (
                <SeatActionButton
                  action={approveSeatRequestAction}
                  fields={{ offerId: offer.offerId, playerId: r.playerId }}
                  label="Approve"
                  pendingLabel="Approving…"
                  variant="outline"
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WaitlistView({ data }: { data: SeatSwapCardData }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        The subscriber picks who gets it. Fee {formatMinor(data.rateMinor)}, paid to them directly.
      </p>
      <ul className="space-y-2">
        {data.openSeats.map((s) => (
          <li key={s.offerId} className={rowClass}>
            <span className="truncate">
              <span className="font-medium">{s.subscriberName}</span>&apos;s seat
              {s.requested ? <span className="text-neutral-500"> · requested</span> : null}
            </span>
            {s.requested ? (
              <SeatActionButton
                action={cancelSeatRequestAction}
                fields={{ offerId: s.offerId }}
                label="Cancel"
                pendingLabel="Cancelling…"
                variant="secondary"
              />
            ) : (
              <SeatActionButton
                action={requestSeatAction}
                fields={{ offerId: s.offerId }}
                label="Request"
                pendingLabel="Requesting…"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReplacementView({ data }: { data: SeatSwapCardData }) {
  const took = data.tookSeat;
  if (!took) return null;
  return (
    <div className={rowClass}>
      <p>
        You have <span className="font-medium">{took.subscriberName}</span>&apos;s seat. Pay them{" "}
        <span className="font-medium">{formatMinor(took.amountMinor)}</span> directly.
      </p>
      <PaidBadge paid={took.paid} />
    </div>
  );
}

export function SeatSwapCard({ data }: { data: SeatSwapCardData }) {
  return (
    <section className="mt-4 rounded-2xl border border-sky-500/30 bg-sky-50/60 p-4 dark:bg-sky-950/20">
      <h2 className="mb-3 text-sm font-semibold">Seat swap</h2>
      {data.role === "subscriber" ? <SubscriberView data={data} /> : null}
      {data.role === "waitlisted" ? <WaitlistView data={data} /> : null}
      {data.role === "replacement" ? <ReplacementView data={data} /> : null}
    </section>
  );
}
