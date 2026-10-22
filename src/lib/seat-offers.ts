import "server-only";
import { sqlClient } from "./db";
import { kickoffAtSql } from "./kickoff-sql";
import { getAvailabilityMatch, getWaitlist, type AvailabilityMatch } from "./availability";
import { getSubscriptionSeasonForMatch, listSubscribers } from "./season-subscriptions";
import { getMatchChargeContext } from "./season-fund";
import { logAppError } from "./error-log";
import {
  canApproveSeat,
  canCancelRequest,
  canPostSeat,
  canRequestSeat,
  canWithdrawSeat,
  isSeatSwapWindowOpen,
  normalizeSeatOfferStatus,
  seatSwapRole,
  type SeatAvailability,
  type SeatOfferStatus,
} from "./seat-offer-rules";

/**
 * Season replacements board (F-4): a core subscriber who will miss a season
 * match offers their seat, waitlisted players request it, and the subscriber
 * approves one. The replacement pays the subscriber directly (rules §8).
 *
 * Every mutation re-checks its invariants in SQL so concurrent requests can't
 * bypass them; the JS pre-checks only produce friendly messages.
 */

export type SeatResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };

// Must match the per-match waitlist key in src/lib/availability.ts.
const WAITLIST_KEY_SQL = (matchIdExpr: string) => `('waitlist_' || (${matchIdExpr})::text)`;

/** Before kickoff and the matchday is not closed. */
function upcomingSql(alias: string): string {
  const kickoff = kickoffAtSql(alias);
  return `((${kickoff}) IS NULL OR (${kickoff}) > NOW())
          AND COALESCE(${alias}.matchday_status, 'draft') <> 'closed'`;
}

/** The player holds an active core place in the match's subscription season. */
function activeSubscriberSql(playerExpr: string, matchIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM matches sm
      JOIN seasons s ON s.id = sm.season_id AND s.subscription_enabled = true
      JOIN season_subscriptions ss
        ON ss.season_id = s.id AND ss.status = 'active' AND ss.player_id = ${playerExpr}
     WHERE sm.id = ${matchIdExpr})`;
}

function onWaitlistSql(playerExpr: string, matchIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM app_settings wa, unnest(string_to_array(wa.value, ',')) AS w(x)
     WHERE wa.key = ${WAITLIST_KEY_SQL(matchIdExpr)}
       AND btrim(w.x) = (${playerExpr})::text)`;
}

function hasStatusSql(playerExpr: string, matchIdExpr: string, status: "in" | "out"): string {
  return `EXISTS (
    SELECT 1 FROM match_availability ma
     WHERE ma.match_id = ${matchIdExpr} AND ma.player_id = ${playerExpr} AND ma.status = '${status}')`;
}

// ── State loading ──────────────────────────────────────────────────────────

type SwapState = {
  match: AvailabilityMatch;
  seasonId: number | null;
  windowOpen: boolean;
  subscriberIds: Set<number>;
  waitlist: number[];
  statuses: Map<number, SeatAvailability>;
};

async function loadSwapState(matchId: number): Promise<SwapState | null> {
  const [match, season, waitlist, statusRows] = await Promise.all([
    getAvailabilityMatch(matchId),
    getSubscriptionSeasonForMatch(matchId),
    getWaitlist(matchId),
    sqlClient.query(
      `SELECT player_id, status FROM match_availability WHERE match_id = $1::int`,
      [matchId],
    ).then((rows) => rows as Array<{ player_id: number; status: string }>),
  ]);
  if (!match) return null;
  const subscribers = season ? await listSubscribers(season.id) : [];
  return {
    match,
    seasonId: season?.id ?? null,
    windowOpen: isSeatSwapWindowOpen({
      kickoffAt: match.kickoffAt,
      matchdayStatus: match.matchdayStatus,
    }),
    subscriberIds: new Set(subscribers.map((s) => s.playerId)),
    waitlist,
    statuses: new Map(
      statusRows.map((r) => [
        Number(r.player_id),
        r.status === "in" || r.status === "out" ? r.status : "pending",
      ]),
    ),
  };
}

function statusOf(state: SwapState, playerId: number): SeatAvailability {
  return state.statuses.get(playerId) ?? "pending";
}

type OfferRow = {
  id: number;
  matchId: number;
  subscriberId: number;
  status: SeatOfferStatus;
  replacementPlayerId: number | null;
};

export async function getSeatOffer(offerId: number): Promise<OfferRow | null> {
  const rows = (await sqlClient.query(
    `SELECT id, match_id, subscriber_id, status, replacement_player_id
       FROM seat_offers WHERE id = $1::int`,
    [offerId],
  )) as Array<{
    id: number;
    match_id: number;
    subscriber_id: number;
    status: string;
    replacement_player_id: number | null;
  }>;
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    matchId: Number(r.match_id),
    subscriberId: Number(r.subscriber_id),
    status: normalizeSeatOfferStatus(r.status),
    replacementPlayerId: r.replacement_player_id == null ? null : Number(r.replacement_player_id),
  };
}

async function hasLiveOffer(matchId: number, subscriberId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM seat_offers
      WHERE match_id = $1::int AND subscriber_id = $2::int AND status IN ('open', 'filled')`,
    [matchId, subscriberId],
  )) as unknown[];
  return rows.length > 0;
}

async function hasRequest(offerId: number, playerId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM seat_offer_requests WHERE offer_id = $1::int AND player_id = $2::int`,
    [offerId, playerId],
  )) as unknown[];
  return rows.length > 0;
}

async function playerName(playerId: number): Promise<string> {
  const rows = (await sqlClient.query(`SELECT name FROM players WHERE id = $1::int`, [
    playerId,
  ])) as Array<{ name: string }>;
  return String(rows[0]?.name ?? "A player");
}

const STALE = "Something changed — refresh and try again.";

// ── Mutations ──────────────────────────────────────────────────────────────

/** A subscriber offers their seat for an upcoming season match. */
export async function postSeatOffer(
  matchId: number,
  subscriberId: number,
): Promise<SeatResult<{ offerId: number; recipients: number[]; playedOn: string }>> {
  const check = async (): Promise<SeatResult<{ state: SwapState }>> => {
    const state = await loadSwapState(matchId);
    if (!state || state.seasonId == null) return { ok: false, reason: "Not a season match." };
    const decision = canPostSeat({
      isSubscriber: state.subscriberIds.has(subscriberId),
      subscriberStatus: statusOf(state, subscriberId),
      hasLiveOffer: await hasLiveOffer(matchId, subscriberId),
      windowOpen: state.windowOpen,
    });
    return decision.ok ? { ok: true, state } : decision;
  };

  const pre = await check();
  if (!pre.ok) return pre;

  const inserted = (await sqlClient.query(
    `INSERT INTO seat_offers (match_id, subscriber_id)
     SELECT m.id, $2::int
       FROM matches m
      WHERE m.id = $1::int
        AND ${upcomingSql("m")}
        AND ${activeSubscriberSql("$2::int", "m.id")}
        AND NOT ${hasStatusSql("$2::int", "m.id", "out")}
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [matchId, subscriberId],
  )) as Array<{ id: number }>;
  if (inserted.length === 0) {
    const again = await check();
    return again.ok ? { ok: false, reason: STALE } : again;
  }

  const { state } = pre;
  const recipients = state.waitlist.filter(
    (id) => id !== subscriberId && !state.subscriberIds.has(id) && statusOf(state, id) !== "in",
  );
  return {
    ok: true,
    offerId: Number(inserted[0].id),
    recipients,
    playedOn: state.match.playedOn,
  };
}

/** The subscriber takes their offer back while nobody has been approved. */
export async function withdrawSeatOffer(
  offerId: number,
  subscriberId: number,
): Promise<SeatResult<{ matchId: number }>> {
  const offer = await getSeatOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found." };
  const decision = canWithdrawSeat({
    isOwner: offer.subscriberId === subscriberId,
    offerStatus: offer.status,
  });
  if (!decision.ok) return decision;

  const updated = (await sqlClient.query(
    `UPDATE seat_offers SET status = 'withdrawn'
      WHERE id = $1::int AND subscriber_id = $2::int AND status = 'open'
      RETURNING id`,
    [offerId, subscriberId],
  )) as unknown[];
  if (updated.length === 0) {
    const fresh = await getSeatOffer(offerId);
    const again = canWithdrawSeat({
      isOwner: fresh?.subscriberId === subscriberId,
      offerStatus: fresh?.status ?? "withdrawn",
    });
    return again.ok ? { ok: false, reason: STALE } : again;
  }
  return { ok: true, matchId: offer.matchId };
}

/** A waitlisted player asks for an open seat. */
export async function requestSeat(
  offerId: number,
  playerId: number,
): Promise<
  SeatResult<{ matchId: number; subscriberId: number; requesterName: string; playedOn: string }>
> {
  const check = async (): Promise<SeatResult<{ offer: OfferRow; state: SwapState }>> => {
    const offer = await getSeatOffer(offerId);
    if (!offer) return { ok: false, reason: "Offer not found." };
    const state = await loadSwapState(offer.matchId);
    if (!state) return { ok: false, reason: "Match not found." };
    const decision = canRequestSeat({
      isOwner: offer.subscriberId === playerId,
      isSubscriber: state.subscriberIds.has(playerId),
      onWaitlist: state.waitlist.includes(playerId),
      requesterStatus: statusOf(state, playerId),
      offerStatus: offer.status,
      subscriberStatus: statusOf(state, offer.subscriberId),
      windowOpen: state.windowOpen,
      alreadyRequested: await hasRequest(offerId, playerId),
    });
    return decision.ok ? { ok: true, offer, state } : decision;
  };

  const pre = await check();
  if (!pre.ok) return pre;

  const inserted = (await sqlClient.query(
    `INSERT INTO seat_offer_requests (offer_id, player_id)
     SELECT so.id, $2::int
       FROM seat_offers so
       JOIN matches m ON m.id = so.match_id
      WHERE so.id = $1::int
        AND so.status = 'open'
        AND so.subscriber_id <> $2::int
        AND ${upcomingSql("m")}
        AND ${onWaitlistSql("$2::int", "so.match_id")}
        AND NOT ${activeSubscriberSql("$2::int", "so.match_id")}
        AND NOT ${hasStatusSql("$2::int", "so.match_id", "in")}
        AND NOT ${hasStatusSql("so.subscriber_id", "so.match_id", "out")}
     ON CONFLICT (offer_id, player_id) DO NOTHING
     RETURNING offer_id`,
    [offerId, playerId],
  )) as unknown[];
  if (inserted.length === 0) {
    const again = await check();
    return again.ok ? { ok: false, reason: STALE } : again;
  }

  return {
    ok: true,
    matchId: pre.offer.matchId,
    subscriberId: pre.offer.subscriberId,
    requesterName: await playerName(playerId),
    playedOn: pre.state.match.playedOn,
  };
}

/** A requester drops their request while the offer is still open. */
export async function cancelSeatRequest(
  offerId: number,
  playerId: number,
): Promise<SeatResult<{ matchId: number }>> {
  const offer = await getSeatOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found." };
  const decision = canCancelRequest({
    hasRequested: await hasRequest(offerId, playerId),
    offerStatus: offer.status,
  });
  if (!decision.ok) return decision;

  const deleted = (await sqlClient.query(
    `DELETE FROM seat_offer_requests r
      USING seat_offers so
      WHERE r.offer_id = $1::int AND r.player_id = $2::int
        AND so.id = r.offer_id AND so.status = 'open'
      RETURNING r.offer_id`,
    [offerId, playerId],
  )) as unknown[];
  if (deleted.length === 0) return { ok: false, reason: "This seat is no longer open." };
  return { ok: true, matchId: offer.matchId };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
  );
}

/**
 * The subscriber hands their seat to one requester, atomically.
 *
 * One Neon HTTP transaction (no interactive transactions there): the first
 * statement fills the offer only if every invariant still holds, and each
 * follow-up only runs when *this* transaction filled it — `filled_at = now()`
 * matches the transaction's own start timestamp, which an earlier fill can't.
 * A concurrent second approval waits on the row lock, then sees
 * status = 'filled' and changes nothing.
 */
export async function approveSeatRequest(
  offerId: number,
  subscriberId: number,
  requesterId: number,
): Promise<
  SeatResult<{ matchId: number; playedOn: string; amountMinor: number; subscriberName: string }>
> {
  const check = async (): Promise<
    SeatResult<{ offer: OfferRow; state: SwapState }>
  > => {
    const offer = await getSeatOffer(offerId);
    if (!offer) return { ok: false, reason: "Offer not found." };
    const state = await loadSwapState(offer.matchId);
    if (!state) return { ok: false, reason: "Match not found." };
    const decision = canApproveSeat({
      isOwner: offer.subscriberId === subscriberId,
      offerStatus: offer.status,
      windowOpen: state.windowOpen,
      subscriberIsActive: state.subscriberIds.has(subscriberId),
      subscriberStatus: statusOf(state, subscriberId),
      requesterRequested: await hasRequest(offerId, requesterId),
      requesterOnWaitlist: state.waitlist.includes(requesterId),
      requesterIsSubscriber: state.subscriberIds.has(requesterId),
      requesterStatus: statusOf(state, requesterId),
    });
    return decision.ok ? { ok: true, offer, state } : decision;
  };

  const pre = await check();
  if (!pre.ok) return pre;
  const matchId = pre.offer.matchId;

  const ctx = await getMatchChargeContext(matchId);
  if (!ctx) return { ok: false, reason: "Not a season match." };
  const amountMinor = ctx.guestRateMinor;

  const filledHere = `EXISTS (
    SELECT 1 FROM seat_offers f
     WHERE f.id = $1::int AND f.status = 'filled'
       AND f.replacement_player_id = $2::int AND f.filled_at = now())`;

  let results: unknown[][];
  try {
    results = (await sqlClient.transaction([
      // 1. Fill the offer — every invariant is re-checked here.
      sqlClient.query(
        `UPDATE seat_offers so
            SET status = 'filled', replacement_player_id = $2::int, filled_at = now()
           FROM matches m
          WHERE so.id = $1::int
            AND so.subscriber_id = $3::int
            AND so.status = 'open'
            AND m.id = so.match_id
            AND ${upcomingSql("m")}
            AND ${activeSubscriberSql("so.subscriber_id", "so.match_id")}
            AND NOT ${hasStatusSql("so.subscriber_id", "so.match_id", "out")}
            AND EXISTS (SELECT 1 FROM seat_offer_requests r
                         WHERE r.offer_id = so.id AND r.player_id = $2::int)
            AND ${onWaitlistSql("$2::int", "so.match_id")}
            AND NOT ${activeSubscriberSql("$2::int", "so.match_id")}
            AND NOT ${hasStatusSql("$2::int", "so.match_id", "in")}
          RETURNING so.id`,
        [offerId, requesterId, subscriberId],
      ),
      // 2. Subscriber OUT, replacement IN.
      sqlClient.query(
        `INSERT INTO match_availability (match_id, player_id, status, updated_at)
         SELECT $4::int, v.player_id, v.status, CURRENT_TIMESTAMP
           FROM (VALUES ($3::int, 'out'::text), ($2::int, 'in'::text)) AS v(player_id, status)
          WHERE ${filledHere}
         ON CONFLICT (match_id, player_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
        [offerId, requesterId, subscriberId, matchId],
      ),
      // 3. Take the replacement off the match waitlist, keeping everyone's order.
      sqlClient.query(
        `UPDATE app_settings a
            SET value = COALESCE((
              SELECT string_agg(btrim(w.x), ',' ORDER BY w.ord)
                FROM unnest(string_to_array(a.value, ',')) WITH ORDINALITY AS w(x, ord)
               WHERE btrim(w.x) <> '' AND btrim(w.x) <> $2::int::text
            ), '')
          WHERE a.key = ${WAITLIST_KEY_SQL("$3::int")}
            AND ${filledHere}`,
        [offerId, requesterId, matchId],
      ),
      // 4. Replacement owes the subscriber the session fee (rules §8). An
      //    unpaid charge raised earlier is converted; a paid one is left alone.
      sqlClient.query(
        `INSERT INTO guest_charges (match_id, player_id, amount_minor, kind, owed_to_player_id)
         SELECT $4::int, $2::int, $5::int, 'replacement', $3::int
          WHERE ${filledHere}
         ON CONFLICT (match_id, player_id) WHERE player_id IS NOT NULL
         DO UPDATE SET kind = 'replacement',
                       owed_to_player_id = EXCLUDED.owed_to_player_id,
                       amount_minor = EXCLUDED.amount_minor
          WHERE guest_charges.paid_at IS NULL`,
        [offerId, requesterId, subscriberId, matchId, amountMinor],
      ),
      // 5. Their requests for other seats in this match are now moot.
      sqlClient.query(
        `DELETE FROM seat_offer_requests r
          USING seat_offers o
          WHERE r.offer_id = o.id AND o.match_id = $3::int AND o.id <> $1::int
            AND r.player_id = $2::int AND ${filledHere}`,
        [offerId, requesterId, matchId],
      ),
    ])) as unknown[][];
  } catch (err) {
    // seat_offers_replacement_idx: they were just approved for another seat.
    if (isUniqueViolation(err)) {
      return { ok: false, reason: "That player has already taken another seat." };
    }
    throw err;
  }

  if ((results[0] ?? []).length === 0) {
    const again = await check();
    return again.ok ? { ok: false, reason: STALE } : again;
  }

  return {
    ok: true,
    matchId,
    playedOn: pre.state.match.playedOn,
    amountMinor,
    subscriberName: await playerName(subscriberId),
  };
}

// ── Read model for the availability page ───────────────────────────────────

export type SeatSwapRequester = { playerId: number; name: string };

export type SeatSwapCardData = {
  matchId: number;
  role: "subscriber" | "replacement" | "waitlisted";
  windowOpen: boolean;
  /** The session fee a replacement pays the subscriber. */
  rateMinor: number;
  /** Subscriber: whether they may offer their seat now. */
  canPost: boolean;
  /** Subscriber: their live (open or filled) offer. */
  myOffer: {
    offerId: number;
    status: "open" | "filled";
    requests: SeatSwapRequester[];
    replacementName: string | null;
    chargeMinor: number | null;
    chargePaid: boolean;
  } | null;
  /** Waitlisted player: seats they may request. */
  openSeats: Array<{ offerId: number; subscriberName: string; requested: boolean }>;
  /** Replacement: whose seat they took and what they owe. */
  tookSeat: { subscriberName: string; amountMinor: number; paid: boolean } | null;
};

type LiveOfferRow = {
  id: number;
  subscriber_id: number;
  subscriber_name: string;
  status: string;
  replacement_player_id: number | null;
  replacement_name: string | null;
  charge_minor: number | null;
  charge_paid_at: string | Date | null;
};

/**
 * Everything the seat-swap card needs for one viewer, or null when the card
 * should stay hidden (non-season match, or the viewer has no role in it).
 * Never throws: a failure here must not take down the availability page.
 */
export async function loadSeatSwapCard(
  matchId: number,
  playerId: number,
): Promise<SeatSwapCardData | null> {
  try {
    const state = await loadSwapState(matchId);
    if (!state || state.seasonId == null) return null;

    const [offerRows, requestRows] = await Promise.all([
      sqlClient.query(
        `SELECT so.id, so.subscriber_id, sp.name AS subscriber_name, so.status,
                so.replacement_player_id, rp.name AS replacement_name,
                gc.amount_minor AS charge_minor, gc.paid_at AS charge_paid_at
           FROM seat_offers so
           JOIN players sp ON sp.id = so.subscriber_id
           LEFT JOIN players rp ON rp.id = so.replacement_player_id
           LEFT JOIN guest_charges gc
                  ON gc.match_id = so.match_id
                 AND gc.player_id = so.replacement_player_id
                 AND gc.kind = 'replacement'
                 AND gc.owed_to_player_id = so.subscriber_id
          WHERE so.match_id = $1::int AND so.status IN ('open', 'filled')
          ORDER BY so.created_at, so.id`,
        [matchId],
      ).then((rows) => rows as LiveOfferRow[]),
      sqlClient.query(
        `SELECT r.offer_id, r.player_id, p.name
           FROM seat_offer_requests r
           JOIN seat_offers so ON so.id = r.offer_id
           JOIN players p ON p.id = r.player_id
          WHERE so.match_id = $1::int AND so.status = 'open'
          ORDER BY r.created_at, r.player_id`,
        [matchId],
      ).then((rows) => rows as Array<{ offer_id: number; player_id: number; name: string }>),
    ]);

    const offers = offerRows.map((r) => ({
      id: Number(r.id),
      subscriberId: Number(r.subscriber_id),
      subscriberName: String(r.subscriber_name),
      status: normalizeSeatOfferStatus(r.status),
      replacementPlayerId: r.replacement_player_id == null ? null : Number(r.replacement_player_id),
      replacementName: r.replacement_name == null ? null : String(r.replacement_name),
      chargeMinor: r.charge_minor == null ? null : Number(r.charge_minor),
      chargePaid: r.charge_paid_at != null,
    }));

    const isSubscriber = state.subscriberIds.has(playerId);
    const onWaitlist = state.waitlist.includes(playerId);
    const took = offers.find(
      (o) => o.status === "filled" && o.replacementPlayerId === playerId,
    );
    const role = seatSwapRole({
      isSeasonMatch: true,
      isSubscriber,
      isReplacement: took != null,
      onWaitlist,
    });
    if (role == null) return null;

    const ctx = await getMatchChargeContext(matchId);
    const rateMinor = ctx?.guestRateMinor ?? 0;

    // Requesters only count while they are still eligible to be approved.
    const eligible = (id: number) =>
      state.waitlist.includes(id) && !state.subscriberIds.has(id) && statusOf(state, id) !== "in";

    const mine = offers.find((o) => o.subscriberId === playerId);
    const post = canPostSeat({
      isSubscriber,
      subscriberStatus: statusOf(state, playerId),
      hasLiveOffer: mine != null,
      windowOpen: state.windowOpen,
    });

    const data: SeatSwapCardData = {
      matchId,
      role,
      windowOpen: state.windowOpen,
      rateMinor,
      canPost: role === "subscriber" && post.ok,
      myOffer:
        role === "subscriber" && mine && mine.status !== "withdrawn"
          ? {
              offerId: mine.id,
              status: mine.status,
              requests: requestRows
                .filter((r) => Number(r.offer_id) === mine.id && eligible(Number(r.player_id)))
                .map((r) => ({ playerId: Number(r.player_id), name: String(r.name) })),
              replacementName: mine.replacementName,
              chargeMinor: mine.chargeMinor,
              chargePaid: mine.chargePaid,
            }
          : null,
      openSeats:
        role === "waitlisted" && eligible(playerId) && state.windowOpen
          ? offers
              .filter(
                (o) => o.status === "open" && statusOf(state, o.subscriberId) !== "out",
              )
              .map((o) => ({
                offerId: o.id,
                subscriberName: o.subscriberName,
                requested: requestRows.some(
                  (r) => Number(r.offer_id) === o.id && Number(r.player_id) === playerId,
                ),
              }))
          : [],
      tookSeat: took
        ? {
            subscriberName: took.subscriberName,
            amountMinor: took.chargeMinor ?? rateMinor,
            paid: took.chargePaid,
          }
        : null,
    };

    // Subscribers always see the card while they can act or have an offer;
    // waitlisted players only when there is a seat to ask for.
    if (role === "subscriber" && !data.canPost && !data.myOffer) return null;
    if (role === "waitlisted" && data.openSeats.length === 0) return null;
    return data;
  } catch (err) {
    await logAppError(err, "seat-offers.load");
    return null;
  }
}
