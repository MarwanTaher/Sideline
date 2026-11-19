import "server-only";
import { sqlClient } from "./db";
import { getSubscriptionSeasonForMatch, listSubscribers } from "./season-subscriptions";
import { reallocateCreditQueries } from "./season-billing";
import {
  newRulesSql,
  CHARGE_CREDIT_STATE_SQL,
  CHARGE_SELECT_SQL,
  CREATE_REPLACEMENT_CREDIT_SQL,
  DELETE_STALE_CHARGES_SQL,
  EXPECTED_FACILITY_BILL_SQL,
  FUND_BALANCE_SQL,
  RECORD_SETTLEMENT_SQL,
  PLAYER_CHARGES_SQL,
} from "./season-fund-sql";

/**
 * Session charges for non-core players, and the group fund they feed.
 *
 * Core subscribers pay a fixed monthly amount. Everyone else pays a flat rate
 * per session, set just above the subscribers' effective per-session cost so
 * nobody plays more cheaply than the people carrying the season commitment.
 *
 * Rules §8 splits those players in two, and only one kind is group money:
 *   - replacement: covering for an absent subscriber, pays that subscriber
 *   - extra:       playing beyond the core 14, pays the fund
 */

export type ChargeKind = "extra" | "replacement";

export type GuestCharge = {
  id: number;
  matchId: number;
  playerId: number | null;
  guestId: number | null;
  name: string;
  amountMinor: number;
  kind: ChargeKind;
  owedToPlayerId: number | null;
  owedToName: string | null;
  paidAt: string | null;
  /**
   * New season rules apply (P2.1): a replacement pays the group and the
   * subscriber it covers is credited on their next invoice.
   */
  newRules: boolean;
};

type ChargeRow = {
  id: number;
  match_id: number;
  player_id: number | null;
  guest_id: number | null;
  name: string;
  amount_minor: number;
  kind: string;
  owed_to_player_id: number | null;
  owed_to_name: string | null;
  paid_at: string | Date | null;
  new_rules?: boolean | null;
};

function toCharge(r: ChargeRow): GuestCharge {
  return {
    id: Number(r.id),
    matchId: Number(r.match_id),
    playerId: r.player_id == null ? null : Number(r.player_id),
    guestId: r.guest_id == null ? null : Number(r.guest_id),
    name: String(r.name ?? "Unknown"),
    amountMinor: Number(r.amount_minor),
    kind: r.kind === "replacement" ? "replacement" : "extra",
    owedToPlayerId: r.owed_to_player_id == null ? null : Number(r.owed_to_player_id),
    owedToName: r.owed_to_name == null ? null : String(r.owed_to_name),
    paidAt:
      r.paid_at == null
        ? null
        : r.paid_at instanceof Date
          ? r.paid_at.toISOString()
          : String(r.paid_at),
    newRules: Boolean(r.new_rules),
  };
}

export async function listGuestCharges(matchId: number): Promise<GuestCharge[]> {
  const rows = (await sqlClient.query(
    `${CHARGE_SELECT_SQL} WHERE gc.match_id = $1 ORDER BY gc.kind, name`,
    [matchId],
  )) as ChargeRow[];
  return rows.map(toCharge);
}

export type PlayerCharge = GuestCharge & { playedOn: string };

/**
 * Session charges a player owes or has paid: their own and their guests'.
 * Pass `matchId` for one match, `unpaidOnly` for what is still open.
 */
export async function listPlayerCharges(
  playerId: number,
  opts: { matchId?: number; unpaidOnly?: boolean } = {},
): Promise<PlayerCharge[]> {
  const rows = (await sqlClient.query(PLAYER_CHARGES_SQL, [
    playerId,
    opts.matchId ?? null,
    Boolean(opts.unpaidOnly),
  ])) as Array<ChargeRow & { played_on: string }>;
  return rows.map((r) => ({ ...toCharge(r), playedOn: String(r.played_on) }));
}

export type MatchChargeContext = {
  matchId: number;
  extended: boolean;
  guestRateMinor: number;
  extensionCostMinor: number;
  extensionMinExtra: number;
  /** Non-core players who should be charged but have no row yet. */
  uncharged: number;
  /** Unpaid charges for players now OUT / core, or guests no longer approved. */
  stale: number;
  extraCount: number;
  squadCount: number;
  extensionThreshold: number | null;
  baseMinutes: number;
  extensionMinutes: number;
  /** New season rules apply to this match (P2.1 / P2.2). */
  newRules: boolean;
};

/**
 * Who owes for this match, and whether extending it pays for itself.
 * Returns null when the match is outside a subscription season.
 */
export async function getMatchChargeContext(
  matchId: number,
): Promise<MatchChargeContext | null> {
  const season = await getSubscriptionSeasonForMatch(matchId);
  if (!season) return null;

  const metaRows = (await sqlClient.query(
    `SELECT COALESCE(m.extended, false) AS extended, sideline_squad_count(m.id) AS squad_count,
      m.extension_threshold,m.base_minutes,m.extension_minutes,m.extension_cost_minor,
      COALESCE(${newRulesSql()}, false) AS new_rules
      FROM matches m LEFT JOIN seasons s ON s.id = m.season_id WHERE m.id = $1`,
    [matchId],
  )) as Array<{ extended: boolean; squad_count: number; extension_threshold: number | null; base_minutes: number; extension_minutes: number; extension_cost_minor: number | null; new_rules: boolean }>;
  const meta = metaRows[0];
  if (!meta) return null;

  const settings = (await sqlClient.query(
    `SELECT guest_rate_minor, extension_cost_minor, extension_min_extra
       FROM seasons WHERE id = $1`,
    [season.id],
  )) as Array<{
    guest_rate_minor: number;
    extension_cost_minor: number;
    extension_min_extra: number;
  }>;
  const s = settings[0];

  const charges = await listGuestCharges(matchId);
  const chargedPlayers = new Set(charges.map((c) => c.playerId).filter((x) => x != null));
  const chargedGuests = new Set(charges.map((c) => c.guestId).filter((x) => x != null));
  const nonCore = await listNonCorePlayers(matchId, season.id);

  const uncharged =
    nonCore.players.filter((p) => !chargedPlayers.has(p.playerId)).length +
    nonCore.guests.filter((g) => !chargedGuests.has(g.guestId)).length;
  const owingPlayers = new Set(nonCore.players.map((p) => p.playerId));
  const owingGuests = new Set(nonCore.guests.map((g) => g.guestId));
  const stale = charges.filter(
    (c) =>
      !c.paidAt &&
      ((c.playerId != null && !owingPlayers.has(c.playerId)) ||
        (c.guestId != null && !owingGuests.has(c.guestId))),
  ).length;

  return {
    matchId,
    extended: Boolean(meta.extended),
    guestRateMinor: Number(s?.guest_rate_minor ?? 3600),
    // Once confirmed, the match keeps that day's price (P2.4).
    extensionCostMinor:
      meta.extended && meta.extension_cost_minor != null
        ? Number(meta.extension_cost_minor)
        : Number(s?.extension_cost_minor ?? 10000),
    extensionMinExtra: Number(s?.extension_min_extra ?? 4),
    uncharged,
    stale,
    extraCount: charges.filter((c) => c.kind === "extra").length + uncharged,
    squadCount: Number(meta.squad_count),
    extensionThreshold: meta.extension_threshold,
    baseMinutes: Number(meta.base_minutes),
    extensionMinutes: Number(meta.extension_minutes),
    newRules: Boolean(meta.new_rules),
  };
}

type NonCore = {
  players: Array<{ playerId: number; name: string }>;
  guests: Array<{ guestId: number; name: string; hostPlayerId: number }>;
};

/** Players IN for the match who hold no core place, plus approved guests. */
async function listNonCorePlayers(matchId: number, seasonId: number): Promise<NonCore> {
  const subscribers = await listSubscribers(seasonId);
  const coreIds = new Set(subscribers.map((s) => s.playerId));

  const playerRows = (await sqlClient.query(
    `SELECT ma.player_id, p.name
       FROM match_availability ma
       JOIN players p ON p.id = ma.player_id
      WHERE ma.match_id = $1 AND ma.status = 'in' AND p.deleted_at IS NULL`,
    [matchId],
  )) as Array<{ player_id: number; name: string }>;

  const guestRows = (await sqlClient.query(
    `SELECT id, name, host_player_id FROM match_guests
      WHERE match_id = $1 AND status = 'approved'`,
    [matchId],
  )) as Array<{ id: number; name: string; host_player_id: number }>;

  return {
    players: playerRows
      .filter((r) => !coreIds.has(Number(r.player_id)))
      .map((r) => ({ playerId: Number(r.player_id), name: String(r.name) })),
    guests: guestRows.map((r) => ({
      guestId: Number(r.id),
      name: String(r.name),
      hostPlayerId: Number(r.host_player_id),
    })),
  };
}

/**
 * Bring a match's charges in line with who is playing: remove unpaid charges
 * that no longer apply, then raise any that are missing. Paid charges and
 * the admin's edits on the remaining ones are kept, so it is safe to re-run.
 */
export async function syncGuestCharges(
  matchId: number,
): Promise<{ created: number; removed: number }> {
  const season = await getSubscriptionSeasonForMatch(matchId);
  if (!season) return { created: 0, removed: 0 };

  const nonCore = await listNonCorePlayers(matchId, season.id);
  const removedRows = (await sqlClient.query(DELETE_STALE_CHARGES_SQL, [
    matchId,
    nonCore.players.map((p) => p.playerId),
    nonCore.guests.map((g) => g.guestId),
  ])) as Array<{ id: number }>;

  const created = await generateGuestCharges(matchId);
  return { created, removed: removedRows.length };
}

/**
 * Raise a charge for every non-core player without one.
 *
 * Old rules: a guest whose host is a core subscriber marked OUT is defaulted
 * to a replacement owed to that host (the admin can change it). New rules:
 * guests are extras; replacements come only from approved seat swaps.
 * Existing charges are never touched, so this is safe to re-run.
 */
export async function generateGuestCharges(matchId: number): Promise<number> {
  const ctx = await getMatchChargeContext(matchId);
  if (!ctx) return 0;

  const season = await getSubscriptionSeasonForMatch(matchId);
  if (!season) return 0;

  const nonCore = await listNonCorePlayers(matchId, season.id);
  const subscribers = await listSubscribers(season.id);
  const coreIds = new Set(subscribers.map((s) => s.playerId));

  const absentRows = (await sqlClient.query(
    `SELECT player_id FROM match_availability
      WHERE match_id = $1 AND status = 'out'`,
    [matchId],
  )) as Array<{ player_id: number }>;
  const absentCore = new Set(
    absentRows.map((r) => Number(r.player_id)).filter((id) => coreIds.has(id)),
  );

  let created = 0;

  for (const p of nonCore.players) {
    const inserted = (await sqlClient.query(
      `INSERT INTO guest_charges (match_id, player_id, amount_minor, kind)
       VALUES ($1, $2, $3, 'extra')
       ON CONFLICT (match_id, player_id) WHERE player_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [matchId, p.playerId, ctx.guestRateMinor],
    )) as Array<{ id: number }>;
    if (inserted.length > 0) created += 1;
  }

  for (const g of nonCore.guests) {
    // Under the new rules only an approved seat swap makes someone a
    // replacement (review §8.3); everyone else is an extra paying the fund.
    const replacesHost = !ctx.newRules && absentCore.has(g.hostPlayerId);
    const inserted = (await sqlClient.query(
      `INSERT INTO guest_charges (match_id, guest_id, amount_minor, kind, owed_to_player_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id, guest_id) WHERE guest_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        matchId,
        g.guestId,
        ctx.guestRateMinor,
        replacesHost ? "replacement" : "extra",
        replacesHost ? g.hostPlayerId : null,
      ],
    )) as Array<{ id: number }>;
    if (inserted.length > 0) created += 1;
  }

  return created;
}

/**
 * Mark a charge paid or unpaid. Under the new season rules a paid
 * replacement credits the covered subscriber (P2.1); un-marking takes that
 * credit back, unless it is already on a paid invoice or settled.
 */
export async function setChargePaid(
  chargeId: number,
  paid: boolean,
): Promise<{ ok: boolean; message?: string }> {
  if (paid) {
    await sqlClient.transaction([
      sqlClient.query(
        `UPDATE guest_charges SET paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP) WHERE id = $1`,
        [chargeId],
      ),
      sqlClient.query(CREATE_REPLACEMENT_CREDIT_SQL, [chargeId]),
    ]);
    return { ok: true };
  }

  const credits = (await sqlClient.query(CHARGE_CREDIT_STATE_SQL, [chargeId])) as Array<{
    id: number;
    applied_invoice_id: number | null;
    settled: boolean;
    invoice_paid: boolean;
  }>;
  const credit = credits[0];
  if (credit && (credit.settled || credit.invoice_paid)) {
    return {
      ok: false,
      message:
        "The subscriber's credit for this replacement is already on a paid bill or settled, so it can't be marked unpaid. Record a fund adjustment instead.",
    };
  }
  await sqlClient.transaction([
    sqlClient.query(`UPDATE guest_charges SET paid_at = NULL WHERE id = $1`, [chargeId]),
    sqlClient.query(`DELETE FROM season_credits WHERE guest_charge_id = $1 AND settled_at IS NULL`, [
      chargeId,
    ]),
    ...(credit?.applied_invoice_id != null
      ? reallocateCreditQueries(Number(credit.applied_invoice_id))
      : []),
  ]);
  return { ok: true };
}

/**
 * Switch a charge between an extra and a replacement. Refused (false) once a
 * paid replacement has credited a subscriber (P2.1): mark it unpaid first.
 */
export async function setChargeKind(
  chargeId: number,
  kind: ChargeKind,
  owedToPlayerId: number | null,
): Promise<boolean> {
  const rows = (await sqlClient.query(
    `UPDATE guest_charges SET kind = $1, owed_to_player_id = $2
      WHERE id = $3
        AND NOT EXISTS (SELECT 1 FROM season_credits sc WHERE sc.guest_charge_id = $3)
      RETURNING id`,
    [kind, kind === "replacement" ? owedToPlayerId : null, chargeId],
  )) as unknown[];
  if (rows.length === 0) return false;
  // A paid charge switched to a new-rules replacement credits the subscriber now.
  await sqlClient.query(CREATE_REPLACEMENT_CREDIT_SQL, [chargeId]);
  return true;
}

export async function deleteCharge(chargeId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM guest_charges WHERE id = $1`, [chargeId]);
}

export async function setMatchExtended(matchId: number, extended: boolean): Promise<void> {
  await sqlClient.transaction([
    sqlClient.query(`SELECT id FROM matches WHERE id=$1 FOR UPDATE`, [matchId]),
    sqlClient.query(`SELECT sideline_confirm_extension($1,$2)`, [matchId, extended]),
  ]);
}

export type FundBalance = {
  roundingMinor: number;
  guestFeesMinor: number;
  guestFeesOutstandingMinor: number;
  extensionCostMinor: number;
  adjustmentsMinor: number;
  /** P2.3: expected facility bills minus what was actually paid. */
  facilityDifferenceMinor: number;
  balanceMinor: number;
};

/**
 * Derived from the underlying rows rather than stored, so the balance can never
 * disagree with what was actually charged and collected.
 */
export async function getFundBalance(seasonId: number): Promise<FundBalance> {
  // One round trip rather than four: the Neon HTTP driver has no connection to
  // reuse, so each separate query costs a full request.
  const rows = (await sqlClient.query(
    FUND_BALANCE_SQL,
    [seasonId],
  )) as Array<{
    rounding: number;
    fees_paid: number;
    fees_outstanding: number;
    extensions: number;
    adjustments: number;
    facility_difference: number;
  }>;

  const r = rows[0];
  const roundingMinor = Number(r?.rounding ?? 0);
  const guestFeesMinor = Number(r?.fees_paid ?? 0);
  const extensionCostMinor = Number(r?.extensions ?? 0);
  const adjustmentsMinor = Number(r?.adjustments ?? 0);
  const facilityDifferenceMinor = Number(r?.facility_difference ?? 0);

  return {
    roundingMinor,
    guestFeesMinor,
    guestFeesOutstandingMinor: Number(r?.fees_outstanding ?? 0),
    extensionCostMinor,
    adjustmentsMinor,
    facilityDifferenceMinor,
    balanceMinor:
      roundingMinor + guestFeesMinor - extensionCostMinor + adjustmentsMinor +
      facilityDifferenceMinor,
  };
}

export type FundAdjustment = {
  id: number;
  amountMinor: number;
  note: string;
  createdAt: string;
};

export async function listAdjustments(seasonId: number): Promise<FundAdjustment[]> {
  const rows = (await sqlClient.query(
    `SELECT id, amount_minor, note, created_at FROM fund_adjustments
      WHERE season_id = $1 ORDER BY created_at DESC`,
    [seasonId],
  )) as Array<{ id: number; amount_minor: number; note: string; created_at: string | Date }>;
  return rows.map((r) => ({
    id: Number(r.id),
    amountMinor: Number(r.amount_minor),
    note: String(r.note ?? ""),
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function addAdjustment(
  seasonId: number,
  amountMinor: number,
  note: string,
  actor: string,
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO fund_adjustments (season_id, amount_minor, note, created_by)
     VALUES ($1, $2, $3, $4)`,
    [seasonId, amountMinor, note.trim(), actor],
  );
}

export async function deleteAdjustment(id: number): Promise<void> {
  await sqlClient.query(`DELETE FROM fund_adjustments WHERE id = $1`, [id]);
}

export type MatchdaySettlement = {
  /** What the facility should be paid now (rate + extension − approved scans). */
  expectedMinor: number;
  approvedScans: number;
  /** What was recorded as paid, if anything yet. */
  recorded: {
    expectedMinor: number;
    paidMinor: number;
    approvedScans: number;
    facilityScans: number | null;
    note: string;
    recordedBy: string;
    recordedAt: string;
  } | null;
};

/** P2.3: expected facility bill for a season match and what was recorded. Null outside a season. */
export async function getMatchdaySettlement(matchId: number): Promise<MatchdaySettlement | null> {
  const [expectedRows, recordedRows] = await Promise.all([
    sqlClient.query(EXPECTED_FACILITY_BILL_SQL, [matchId]) as unknown as Promise<
      Array<{ expected_minor: number; approved_scans: number }>
    >,
    sqlClient.query(
      `SELECT expected_minor, paid_minor, approved_scans, facility_scans, note, recorded_by, recorded_at
         FROM matchday_settlements WHERE match_id = $1`,
      [matchId],
    ) as unknown as Promise<
      Array<{
        expected_minor: number;
        paid_minor: number;
        approved_scans: number;
        facility_scans: number | null;
        note: string;
        recorded_by: string;
        recorded_at: string | Date;
      }>
    >,
  ]);
  const e = expectedRows[0];
  if (!e) return null;
  const r = recordedRows[0];
  return {
    expectedMinor: Number(e.expected_minor),
    approvedScans: Number(e.approved_scans),
    recorded: r
      ? {
          expectedMinor: Number(r.expected_minor),
          paidMinor: Number(r.paid_minor),
          approvedScans: Number(r.approved_scans),
          facilityScans: r.facility_scans == null ? null : Number(r.facility_scans),
          note: String(r.note ?? ""),
          recordedBy: String(r.recorded_by ?? ""),
          recordedAt: r.recorded_at instanceof Date ? r.recorded_at.toISOString() : String(r.recorded_at),
        }
      : null,
  };
}

/** P2.3: record what the group paid the facility; re-recording corrects it. */
export async function recordMatchdaySettlement(
  matchId: number,
  input: { paidMinor: number; facilityScans: number | null; note: string },
  actor: string,
): Promise<boolean> {
  const rows = (await sqlClient.query(RECORD_SETTLEMENT_SQL, [
    matchId,
    input.paidMinor,
    input.facilityScans,
    input.note.trim().slice(0, 300),
    actor,
  ])) as unknown[];
  return rows.length > 0;
}
