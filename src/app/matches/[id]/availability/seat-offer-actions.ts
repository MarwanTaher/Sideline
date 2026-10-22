"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  approveSeatRequest,
  cancelSeatRequest,
  postSeatOffer,
  requestSeat,
  withdrawSeatOffer,
} from "@/lib/seat-offers";
import { notify, type PushPayload } from "@/lib/push";
import type { NotificationTypeKey } from "@/lib/notification-types";
import { logAppError } from "@/lib/error-log";
import { matchLabel } from "@/lib/format";
import { formatMinor } from "@/lib/format-money";

export interface SeatOfferActionState {
  ok: boolean;
  message: string;
}

const idSchema = z.coerce.number().int().positive();

const FAILED = "Something went wrong. Please try again.";

async function requirePlayer(): Promise<number | null> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  return playerId == null ? null : Number(playerId);
}

function revalidateSwap(matchId: number): void {
  revalidatePath("/");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/availability`);
  revalidatePath(`/matches/${matchId}/draft`);
}

/** Pushes are best-effort: a failure is logged, never surfaced to the user. */
async function safeNotify(
  type: NotificationTypeKey,
  payload: PushPayload,
  playerIds: number[],
): Promise<void> {
  if (playerIds.length === 0) return;
  try {
    await notify(type, payload, { playerIds });
  } catch (err) {
    await logAppError(err, "seat-offers.push");
  }
}

function invalid(err: unknown): SeatOfferActionState | null {
  return err instanceof z.ZodError ? { ok: false, message: "Invalid request." } : null;
}

/** Subscriber: offer my seat for this season match. */
export async function postSeatOfferAction(
  _prev: SeatOfferActionState,
  formData: FormData,
): Promise<SeatOfferActionState> {
  try {
    const playerId = await requirePlayer();
    if (playerId == null) return { ok: false, message: "Sign in as a player." };
    const matchId = idSchema.parse(formData.get("matchId"));

    const result = await postSeatOffer(matchId, playerId);
    if (!result.ok) return { ok: false, message: result.reason };

    await safeNotify(
      "seat_offer_posted",
      {
        title: `A season seat is available for ${matchLabel(result.playedOn)}`,
        body: "You're on the waitlist — tap to request it.",
        url: `/matches/${matchId}/availability`,
        tag: `seat-offer-${result.offerId}`,
      },
      result.recipients,
    );
    revalidateSwap(matchId);
    return { ok: true, message: "Seat offered to the waitlist." };
  } catch (err) {
    const bad = invalid(err);
    if (bad) return bad;
    await logAppError(err, "seat-offers.post");
    return { ok: false, message: FAILED };
  }
}

/** Subscriber: take back an offer nobody has been approved for. */
export async function withdrawSeatOfferAction(
  _prev: SeatOfferActionState,
  formData: FormData,
): Promise<SeatOfferActionState> {
  try {
    const playerId = await requirePlayer();
    if (playerId == null) return { ok: false, message: "Sign in as a player." };
    const offerId = idSchema.parse(formData.get("offerId"));

    const result = await withdrawSeatOffer(offerId, playerId);
    if (!result.ok) return { ok: false, message: result.reason };
    revalidateSwap(result.matchId);
    return { ok: true, message: "Offer withdrawn — you keep your seat." };
  } catch (err) {
    const bad = invalid(err);
    if (bad) return bad;
    await logAppError(err, "seat-offers.withdraw");
    return { ok: false, message: FAILED };
  }
}

/** Waitlisted player: ask for an offered seat. */
export async function requestSeatAction(
  _prev: SeatOfferActionState,
  formData: FormData,
): Promise<SeatOfferActionState> {
  try {
    const playerId = await requirePlayer();
    if (playerId == null) return { ok: false, message: "Sign in as a player." };
    const offerId = idSchema.parse(formData.get("offerId"));

    const result = await requestSeat(offerId, playerId);
    if (!result.ok) return { ok: false, message: result.reason };

    await safeNotify(
      "seat_offer_requested",
      {
        title: "Someone wants your seat",
        body: `${result.requesterName} asked for your seat on ${matchLabel(result.playedOn)}. Tap to approve.`,
        url: `/matches/${result.matchId}/availability`,
        tag: `seat-offer-${offerId}-request`,
      },
      [result.subscriberId],
    );
    revalidateSwap(result.matchId);
    return { ok: true, message: "Requested — the subscriber picks who gets it." };
  } catch (err) {
    const bad = invalid(err);
    if (bad) return bad;
    await logAppError(err, "seat-offers.request");
    return { ok: false, message: FAILED };
  }
}

/** Waitlisted player: drop my request. */
export async function cancelSeatRequestAction(
  _prev: SeatOfferActionState,
  formData: FormData,
): Promise<SeatOfferActionState> {
  try {
    const playerId = await requirePlayer();
    if (playerId == null) return { ok: false, message: "Sign in as a player." };
    const offerId = idSchema.parse(formData.get("offerId"));

    const result = await cancelSeatRequest(offerId, playerId);
    if (!result.ok) return { ok: false, message: result.reason };
    revalidateSwap(result.matchId);
    return { ok: true, message: "Request cancelled." };
  } catch (err) {
    const bad = invalid(err);
    if (bad) return bad;
    await logAppError(err, "seat-offers.cancel");
    return { ok: false, message: FAILED };
  }
}

/** Subscriber: hand my seat to one requester. */
export async function approveSeatRequestAction(
  _prev: SeatOfferActionState,
  formData: FormData,
): Promise<SeatOfferActionState> {
  try {
    const playerId = await requirePlayer();
    if (playerId == null) return { ok: false, message: "Sign in as a player." };
    const offerId = idSchema.parse(formData.get("offerId"));
    const requesterId = idSchema.parse(formData.get("playerId"));

    const result = await approveSeatRequest(offerId, playerId, requesterId);
    if (!result.ok) return { ok: false, message: result.reason };

    await safeNotify(
      "seat_offer_approved",
      {
        title: `You're in for ${matchLabel(result.playedOn)} ⚽`,
        body: `${result.subscriberName} gave you their season seat. Pay them ${formatMinor(result.amountMinor)} directly.`,
        url: `/matches/${result.matchId}/availability`,
        tag: `seat-offer-${offerId}-approved`,
      },
      [requesterId],
    );
    revalidateSwap(result.matchId);
    return { ok: true, message: "Seat handed over." };
  } catch (err) {
    const bad = invalid(err);
    if (bad) return bad;
    await logAppError(err, "seat-offers.approve");
    return { ok: false, message: FAILED };
  }
}
