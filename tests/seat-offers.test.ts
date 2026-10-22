import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveSeat,
  canCancelRequest,
  canPostSeat,
  canRequestSeat,
  canWithdrawSeat,
  isSeatSwapWindowOpen,
  normalizeSeatOfferStatus,
  seatSwapRole,
} from "../src/lib/seat-offer-rules";

const KICKOFF = "2026-11-06T20:00:00.000Z";
const kickoffMs = Date.parse(KICKOFF);

test("swap window is open until kickoff and ignores the 24h lock", () => {
  const open = (nowMs: number, matchdayStatus = "draft") =>
    isSeatSwapWindowOpen({ kickoffAt: KICKOFF, matchdayStatus, nowMs });
  assert.equal(open(kickoffMs - 3 * 24 * 3600_000), true);
  assert.equal(open(kickoffMs - 60_000), true, "inside the 24h lock the swap still works");
  assert.equal(open(kickoffMs), false, "closes at kickoff");
  assert.equal(open(kickoffMs + 60_000), false);
  assert.equal(open(kickoffMs - 60_000, "active"), true);
  assert.equal(open(kickoffMs - 60_000, "closed"), false, "closed matchday");
  assert.equal(open(kickoffMs - 60_000, "CLOSED"), false);
  assert.equal(
    isSeatSwapWindowOpen({ kickoffAt: null, matchdayStatus: null, nowMs: kickoffMs }),
    true,
    "no kickoff instant means no deadline",
  );
});

test("only an active subscriber still holding their seat can post once", () => {
  const base = { isSubscriber: true, subscriberStatus: "in" as const, hasLiveOffer: false, windowOpen: true };
  assert.deepEqual(canPostSeat(base), { ok: true });
  assert.deepEqual(canPostSeat({ ...base, subscriberStatus: "pending" }), { ok: true });
  assert.equal(canPostSeat({ ...base, isSubscriber: false }).ok, false);
  assert.equal(canPostSeat({ ...base, windowOpen: false }).ok, false);
  assert.equal(canPostSeat({ ...base, hasLiveOffer: true }).ok, false);
  assert.equal(canPostSeat({ ...base, subscriberStatus: "out" }).ok, false);
});

test("withdraw is owner-only and only while open", () => {
  assert.deepEqual(canWithdrawSeat({ isOwner: true, offerStatus: "open" }), { ok: true });
  assert.equal(canWithdrawSeat({ isOwner: false, offerStatus: "open" }).ok, false);
  const filled = canWithdrawSeat({ isOwner: true, offerStatus: "filled" });
  assert.equal(filled.ok, false);
  assert.match(filled.ok ? "" : filled.reason, /taken/);
  assert.equal(canWithdrawSeat({ isOwner: true, offerStatus: "withdrawn" }).ok, false);
});

const requestBase = {
  isOwner: false,
  isSubscriber: false,
  onWaitlist: true,
  requesterStatus: "pending" as const,
  offerStatus: "open" as const,
  subscriberStatus: "in" as const,
  windowOpen: true,
  alreadyRequested: false,
};

test("only waitlisted non-core players can request an open seat", () => {
  assert.deepEqual(canRequestSeat(requestBase), { ok: true });
  assert.deepEqual(canRequestSeat({ ...requestBase, requesterStatus: "out" }), { ok: true });
  const notQueued = canRequestSeat({ ...requestBase, onWaitlist: false });
  assert.equal(notQueued.ok, false);
  assert.match(notQueued.ok ? "" : notQueued.reason, /waitlist/);
  assert.equal(canRequestSeat({ ...requestBase, isOwner: true }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, isSubscriber: true }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, requesterStatus: "in" }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, offerStatus: "filled" }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, offerStatus: "withdrawn" }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, subscriberStatus: "out" }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, windowOpen: false }).ok, false);
  assert.equal(canRequestSeat({ ...requestBase, alreadyRequested: true }).ok, false);
});

test("a request can be cancelled only while the offer is open", () => {
  assert.deepEqual(canCancelRequest({ hasRequested: true, offerStatus: "open" }), { ok: true });
  assert.equal(canCancelRequest({ hasRequested: false, offerStatus: "open" }).ok, false);
  assert.equal(canCancelRequest({ hasRequested: true, offerStatus: "filled" }).ok, false);
});

const approveBase = {
  isOwner: true,
  offerStatus: "open" as const,
  windowOpen: true,
  subscriberIsActive: true,
  subscriberStatus: "in" as const,
  requesterRequested: true,
  requesterOnWaitlist: true,
  requesterIsSubscriber: false,
  requesterStatus: "pending" as const,
};

test("approval needs the owner, an open offer and a still-waitlisted requester", () => {
  assert.deepEqual(canApproveSeat(approveBase), { ok: true });
  const cases: Array<[Partial<typeof approveBase> | Record<string, unknown>, RegExp]> = [
    [{ isOwner: false }, /Only the subscriber/],
    [{ offerStatus: "filled" }, /already been taken/],
    [{ offerStatus: "withdrawn" }, /no longer open/],
    [{ windowOpen: false }, /started/],
    [{ subscriberIsActive: false }, /season place/],
    [{ subscriberStatus: "out" }, /OUT/],
    [{ requesterRequested: false }, /hasn't requested/],
    [{ requesterIsSubscriber: true }, /season place/],
    [{ requesterStatus: "in" }, /already in/],
    [{ requesterOnWaitlist: false }, /no longer on the waitlist/],
  ];
  for (const [patch, reason] of cases) {
    const decision = canApproveSeat({ ...approveBase, ...patch } as typeof approveBase);
    assert.equal(decision.ok, false, JSON.stringify(patch));
    assert.match(decision.ok ? "" : decision.reason, reason);
  }
});

test("approval inside the 24h lock is allowed (window is only kickoff-bound)", () => {
  const windowOpen = isSeatSwapWindowOpen({
    kickoffAt: KICKOFF,
    matchdayStatus: "active",
    nowMs: kickoffMs - 2 * 3600_000,
  });
  assert.deepEqual(canApproveSeat({ ...approveBase, windowOpen }), { ok: true });
});

test("card role: season match only, subscriber first, then replacement, then waitlist", () => {
  const base = { isSeasonMatch: true, isSubscriber: false, isReplacement: false, onWaitlist: false };
  assert.equal(seatSwapRole(base), null);
  assert.equal(seatSwapRole({ ...base, isSeasonMatch: false, isSubscriber: true }), null);
  assert.equal(seatSwapRole({ ...base, isSubscriber: true, onWaitlist: true }), "subscriber");
  assert.equal(seatSwapRole({ ...base, isReplacement: true }), "replacement");
  assert.equal(seatSwapRole({ ...base, onWaitlist: true }), "waitlisted");
});

test("unknown offer statuses are treated as closed", () => {
  assert.equal(normalizeSeatOfferStatus("filled"), "filled");
  assert.equal(normalizeSeatOfferStatus("withdrawn"), "withdrawn");
  assert.equal(normalizeSeatOfferStatus("open"), "open");
  assert.equal(normalizeSeatOfferStatus(null), "withdrawn");
  assert.equal(normalizeSeatOfferStatus("OPEN"), "withdrawn");
});
