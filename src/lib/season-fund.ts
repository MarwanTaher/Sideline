import "server-only";
import { sqlClient } from "./db";
import { getSubscriptionSeasonForMatch, listSubscribers } from "./season-subscriptions";

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
  };
}

const CHARGE_SELECT = `
  SELECT gc.id, gc.match_id, gc.player_id, gc.guest_id,
         COALESCE(p.name, mg.name) AS name,
         gc.amount_minor, gc.kind, gc.owed_to_player_id,
         owed.name AS owed_to_name, gc.paid_at
    FROM guest_charges gc
    LEFT JOIN players p ON p.id = gc.player_id
    LEFT JOIN match_guests mg ON mg.id = gc.guest_id
    LEFT JOIN players owed ON owed.id = gc.owed_to_player_id`;

export async function listGuestCharges(matchId: number): Promise<GuestCharge[]> {
  const rows = (await sqlClient.query(
    `${CHARGE_SELECT} WHERE gc.match_id = $1 ORDER BY gc.kind, name`,
    [matchId],
  )) as ChargeRow[];
  return rows.map(toCharge);
}

export type MatchChargeContext = {
  matchId: number;
  extended: boolean;
  guestRateMinor: number;
  extensionCostMinor: number;
  extensionMinExtra: number;
  /** Non-core players who should be charged but have no row yet. */
  uncharged: number;
  extraCount: number;
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
    `SELECT COALESCE(extended, false) AS extended FROM matches WHERE id = $1`,
    [matchId],
  )) as Array<{ extended: boolean }>;
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

  return {
    matchId,
    extended: Boolean(meta.extended),
    guestRateMinor: Number(s?.guest_rate_minor ?? 3600),
    extensionCostMinor: Number(s?.extension_cost_minor ?? 10000),
    extensionMinExtra: Number(s?.extension_min_extra ?? 4),
    uncharged,
    extraCount: charges.filter((c) => c.kind === "extra").length + uncharged,
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
 * Raise a charge for every non-core player without one.
 *
 * A guest whose host is a core subscriber marked OUT is defaulted to a
 * replacement owed to that host — the common case, and the admin can change it.
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
    const replacesHost = absentCore.has(g.hostPlayerId);
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

export async function setChargePaid(chargeId: number, paid: boolean): Promise<void> {
  await sqlClient.query(
    `UPDATE guest_charges SET paid_at = ${paid ? "CURRENT_TIMESTAMP" : "NULL"} WHERE id = $1`,
    [chargeId],
  );
}

/** Switch a charge between paying the group and reimbursing a subscriber. */
export async function setChargeKind(
  chargeId: number,
  kind: ChargeKind,
  owedToPlayerId: number | null,
): Promise<void> {
  await sqlClient.query(
    `UPDATE guest_charges SET kind = $1, owed_to_player_id = $2 WHERE id = $3`,
    [kind, kind === "replacement" ? owedToPlayerId : null, chargeId],
  );
}

export async function deleteCharge(chargeId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM guest_charges WHERE id = $1`, [chargeId]);
}

export async function setMatchExtended(matchId: number, extended: boolean): Promise<void> {
  await sqlClient.query(`UPDATE matches SET extended = $1 WHERE id = $2`, [
    extended,
    matchId,
  ]);
}

export type FundBalance = {
  roundingMinor: number;
  guestFeesMinor: number;
  guestFeesOutstandingMinor: number;
  extensionCostMinor: number;
  adjustmentsMinor: number;
  balanceMinor: number;
};

/**
 * Derived from the underlying rows rather than stored, so the balance can never
 * disagree with what was actually charged and collected.
 */
export async function getFundBalance(seasonId: number): Promise<FundBalance> {
  const rounding = (await sqlClient.query(
    `SELECT COALESCE(SUM(CASE WHEN paid_at IS NOT NULL
              THEN (CEIL(gross_minor::numeric / 100) * 100) - gross_minor ELSE 0 END), 0)::int AS total
       FROM season_invoices WHERE season_id = $1`,
    [seasonId],
  )) as Array<{ total: number }>;

  // Only 'extra' charges are group money; replacements are settled privately.
  const fees = (await sqlClient.query(
    `SELECT COALESCE(SUM(CASE WHEN gc.paid_at IS NOT NULL THEN gc.amount_minor ELSE 0 END), 0)::int AS paid,
            COALESCE(SUM(CASE WHEN gc.paid_at IS NULL THEN gc.amount_minor ELSE 0 END), 0)::int AS outstanding
       FROM guest_charges gc
       JOIN matches m ON m.id = gc.match_id
      WHERE gc.kind = 'extra' AND m.season_id = $1`,
    [seasonId],
  )) as Array<{ paid: number; outstanding: number }>;

  const extensions = (await sqlClient.query(
    `SELECT COALESCE(COUNT(*) * MAX(s.extension_cost_minor), 0)::int AS total
       FROM matches m
       JOIN seasons s ON s.id = $1
      WHERE m.extended = true AND m.season_id = $1`,
    [seasonId],
  )) as Array<{ total: number }>;

  const adjustments = (await sqlClient.query(
    `SELECT COALESCE(SUM(amount_minor), 0)::int AS total
       FROM fund_adjustments WHERE season_id = $1`,
    [seasonId],
  )) as Array<{ total: number }>;

  const roundingMinor = Number(rounding[0]?.total ?? 0);
  const guestFeesMinor = Number(fees[0]?.paid ?? 0);
  const extensionCostMinor = Number(extensions[0]?.total ?? 0);
  const adjustmentsMinor = Number(adjustments[0]?.total ?? 0);

  return {
    roundingMinor,
    guestFeesMinor,
    guestFeesOutstandingMinor: Number(fees[0]?.outstanding ?? 0),
    extensionCostMinor,
    adjustmentsMinor,
    balanceMinor:
      roundingMinor + guestFeesMinor - extensionCostMinor + adjustmentsMinor,
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
