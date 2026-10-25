// Client-safe, DB-free decision rules for the season seat swap (F-4).
//
// A core subscriber who will miss a season match offers their seat; only
// players on that match's waitlist may request it, and the subscriber approves
// one of them. The server repeats every check as guarded SQL — these helpers
// exist to give clear messages, drive the UI and be unit-tested.

import { kickoffMs, type KickoffInput } from "./match-schedule";

export type SeatOfferStatus = "open" | "filled" | "withdrawn";
export type SeatAvailability = "in" | "out" | "pending";

export type SeatDecision = { ok: true } | { ok: false; reason: string };

const OK: SeatDecision = { ok: true };
const no = (reason: string): SeatDecision => ({ ok: false, reason });

export function normalizeSeatOfferStatus(value: unknown): SeatOfferStatus {
  // Anything unrecognised is treated as closed, never as actionable.
  return value === "open" || value === "filled" ? value : "withdrawn";
}

/**
 * Seats can change hands until kickoff, as long as the matchday is not closed.
 * The 24h availability lock does not apply: a swap keeps the squad size.
 */
export function isSeatSwapWindowOpen(input: {
  kickoffAt: KickoffInput;
  matchdayStatus: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (String(input.matchdayStatus ?? "draft").toLowerCase() === "closed") return false;
  const start = kickoffMs(input.kickoffAt);
  return start == null || (input.nowMs ?? Date.now()) < start;
}

export function canPostSeat(input: {
  isSubscriber: boolean;
  subscriberStatus: SeatAvailability;
  hasLiveOffer: boolean;
  windowOpen: boolean;
}): SeatDecision {
  if (!input.isSubscriber) return no("Only season subscribers can offer a seat.");
  if (!input.windowOpen) return no("This match has already started.");
  if (input.hasLiveOffer) return no("You have already offered your seat.");
  if (input.subscriberStatus === "out") {
    return no("You're already marked OUT, so there is no seat to hand over.");
  }
  return OK;
}

export function canWithdrawSeat(input: {
  isOwner: boolean;
  offerStatus: SeatOfferStatus;
}): SeatDecision {
  if (!input.isOwner) return no("This is not your seat.");
  if (input.offerStatus === "filled") return no("Your seat has already been taken.");
  if (input.offerStatus !== "open") return no("This offer is no longer open.");
  return OK;
}

export function canRequestSeat(input: {
  isOwner: boolean;
  isSubscriber: boolean;
  onWaitlist: boolean;
  requesterStatus: SeatAvailability;
  offerStatus: SeatOfferStatus;
  subscriberStatus: SeatAvailability;
  windowOpen: boolean;
  alreadyRequested: boolean;
}): SeatDecision {
  if (input.isOwner) return no("You can't request your own seat.");
  if (input.isSubscriber) return no("Season subscribers already have a seat.");
  if (!input.onWaitlist) return no("Only players on the waitlist can request a seat.");
  if (input.requesterStatus === "in") return no("You're already in this match.");
  if (input.offerStatus !== "open" || input.subscriberStatus === "out") {
    return no("This seat is no longer available.");
  }
  if (!input.windowOpen) return no("This match has already started.");
  if (input.alreadyRequested) return no("You've already requested this seat.");
  return OK;
}

export function canCancelRequest(input: {
  hasRequested: boolean;
  offerStatus: SeatOfferStatus;
}): SeatDecision {
  if (!input.hasRequested) return no("You haven't requested this seat.");
  if (input.offerStatus !== "open") return no("This seat is no longer open.");
  return OK;
}

export function canApproveSeat(input: {
  isOwner: boolean;
  offerStatus: SeatOfferStatus;
  windowOpen: boolean;
  subscriberIsActive: boolean;
  subscriberStatus: SeatAvailability;
  requesterRequested: boolean;
  requesterOnWaitlist: boolean;
  requesterIsSubscriber: boolean;
  requesterStatus: SeatAvailability;
}): SeatDecision {
  if (!input.isOwner) return no("Only the subscriber can approve their seat.");
  if (input.offerStatus === "filled") return no("Your seat has already been taken.");
  if (input.offerStatus !== "open") return no("This offer is no longer open.");
  if (!input.windowOpen) return no("This match has already started.");
  if (!input.subscriberIsActive) return no("You no longer hold a season place.");
  if (input.subscriberStatus === "out") {
    return no("You're already marked OUT, so there is no seat to hand over.");
  }
  if (!input.requesterRequested) return no("That player hasn't requested your seat.");
  if (input.requesterIsSubscriber) return no("That player already holds a season place.");
  if (input.requesterStatus === "in") return no("That player is already in this match.");
  if (!input.requesterOnWaitlist) return no("That player is no longer on the waitlist.");
  return OK;
}

export type SeatSwapRole = "subscriber" | "replacement" | "waitlisted" | null;

/**
 * Who sees the seat-swap card: subscribers, waitlisted players, and anyone
 * who already took a seat for this match. Everyone else has no role in it.
 */
export function seatSwapRole(input: {
  isSeasonMatch: boolean;
  isSubscriber: boolean;
  isReplacement: boolean;
  onWaitlist: boolean;
}): SeatSwapRole {
  if (!input.isSeasonMatch) return null;
  if (input.isSubscriber) return "subscriber";
  if (input.isReplacement) return "replacement";
  if (input.onWaitlist) return "waitlisted";
  return null;
}
