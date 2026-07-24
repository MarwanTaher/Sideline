import { sqlClient } from "@/lib/db";
import { fmtDate } from "@/lib/matches";

export interface PaymentMeta {
  id: number;
  playedOn: string;
  totalPayment: number;
  paymentName: string;
  paymentMobile: string;
  paymentMethod: string;
  paymentNote: string;
  payLink: string;
  paymentsActive: boolean;
}

export interface PaymentRow {
  playerId: number;
  name: string;
  teamNo: number;
  paid: boolean;
  updatedAt: string | null;
}

export interface PaymentSummary {
  totalPlayers: number;
  paidCount: number;
  unpaidCount: number;
  sharePerPlayer: number;
  collected: number;
  remaining: number;
  changeCollected: number;
}

export interface MatchOption {
  id: number;
  label: string;
}

interface MatchRow {
  id: number;
  played_on: string;
}

export async function listMatchesForPayments(): Promise<MatchOption[]> {
  const raw = (await sqlClient.query(
    `SELECT id, played_on FROM matches ORDER BY id DESC`,
  )) as unknown as MatchRow[];
  return raw.map((m) => ({ id: m.id, label: `Match ${m.id} (${fmtDate(m.played_on)})` }));
}

interface MetaRow {
  id: number;
  played_on: string;
  total_payment: number;
  payment_name: string;
  payment_mobile: string;
  payment_method: string;
  payment_note: string;
  pay_link: string;
  payments_active: number;
}

export async function getPaymentMeta(matchId: number): Promise<PaymentMeta | null> {
  const raw = (await sqlClient.query(
    `SELECT id, played_on,
            COALESCE(total_payment, 0) AS total_payment,
            COALESCE(payment_name, '') AS payment_name,
            COALESCE(payment_mobile, '') AS payment_mobile,
            COALESCE(payment_method, '') AS payment_method,
            COALESCE(payment_note, '') AS payment_note,
            COALESCE(pay_link, '') AS pay_link,
            COALESCE(payments_active, 0) AS payments_active
     FROM matches WHERE id = $1`,
    [matchId],
  )) as unknown as MetaRow[];
  if (raw.length === 0) return null;
  const r = raw[0];
  return {
    id: r.id,
    playedOn: r.played_on,
    totalPayment: Number(r.total_payment),
    paymentName: r.payment_name,
    paymentMobile: r.payment_mobile,
    paymentMethod: r.payment_method,
    paymentNote: r.payment_note,
    payLink: r.pay_link,
    paymentsActive: Number(r.payments_active) === 1,
  };
}

interface PayRawRow {
  player_id: number;
  name: string;
  team_no: number;
  paid: number;
  updated_at: string | null;
}

export async function getPaymentRows(matchId: number): Promise<PaymentRow[]> {
  const raw = (await sqlClient.query(
    `SELECT mp.player_id, p.name, mp.team_no,
            COALESCE(pay.paid, 0) AS paid,
            pay.updated_at
     FROM match_players mp
     JOIN players p ON p.id = mp.player_id
     LEFT JOIN payments pay ON pay.match_id = mp.match_id AND pay.player_id = mp.player_id
     WHERE mp.match_id = $1
     ORDER BY mp.team_no, p.name`,
    [matchId],
  )) as unknown as PayRawRow[];
  return raw.map((r) => ({
    playerId: r.player_id,
    name: r.name,
    teamNo: r.team_no,
    paid: r.paid === 1,
    updatedAt: r.updated_at,
  }));
}

/** Player IDs in a match who have not paid yet, plus hosts owing for unpaid guests. */
export async function getUnpaidPlayerIds(matchId: number): Promise<number[]> {
  const rows = await getPaymentRows(matchId);
  const ids = new Set(rows.filter((r) => !r.paid).map((r) => r.playerId));
  // Hosts are responsible for their guests' share, so remind them too.
  const hostRows = (await sqlClient.query(
    `SELECT DISTINCT host_player_id FROM match_guests WHERE match_id = $1 AND paid = 0 AND status = 'approved'`,
    [matchId],
  )) as unknown as { host_player_id: number }[];
  for (const h of hostRows) ids.add(h.host_player_id);
  return [...ids];
}

/**
 * Mirrors the Streamlit share math, extended for guests: the pot is split across
 * every head (players + guests), so share = ceil(total / (players + guests)).
 * Each paid head contributes one share to the collected total.
 */
export function computeSummary(
  rows: PaymentRow[],
  totalPayment: number,
  guestPaid: boolean[] = [],
): PaymentSummary {
  const totalPlayers = rows.length + guestPaid.length;
  const paidCount =
    rows.filter((r) => r.paid).length + guestPaid.filter(Boolean).length;
  const sharePerPlayer = totalPlayers > 0 ? Math.ceil(totalPayment / totalPlayers) : 0;
  const collected = sharePerPlayer * paidCount;
  const remaining = Math.max(Math.trunc(totalPayment) - collected, 0);
  // Rounding each share up means a fully collected pot slightly exceeds the
  // actual amount owed. The overage is the extra "change" kept once collected
  // has passed the real total.
  const changeCollected = Math.max(collected - Math.trunc(totalPayment), 0);
  return {
    totalPlayers,
    paidCount,
    unpaidCount: totalPlayers - paidCount,
    sharePerPlayer,
    collected,
    remaining,
    changeCollected,
  };
}

/**
 * Total rounding "change" collected across every match so far: for each match
 * we split the pot across all heads (players + guests) rounding each share up,
 * then sum how much the collected amount exceeds the real pot. Mirrors the
 * per-match `changeCollected` from {@link computeSummary}.
 */
export async function getTotalPaymentChange(): Promise<number> {
  const raw = (await sqlClient.query(
    `SELECT m.id,
            COALESCE(m.total_payment, 0) AS total_payment,
            (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = m.id) AS player_heads,
            (SELECT COUNT(*) FROM match_guests g WHERE g.match_id = m.id AND g.status = 'approved') AS guest_heads,
            (SELECT COUNT(*) FROM match_players mp2
               LEFT JOIN payments pay ON pay.match_id = mp2.match_id AND pay.player_id = mp2.player_id
             WHERE mp2.match_id = m.id AND COALESCE(pay.paid, 0) = 1) AS paid_players,
            (SELECT COUNT(*) FROM match_guests g2 WHERE g2.match_id = m.id AND g2.paid = 1 AND g2.status = 'approved') AS paid_guests
     FROM matches m`,
  )) as unknown as Array<{
    total_payment: number | string;
    player_heads: number | string;
    guest_heads: number | string;
    paid_players: number | string;
    paid_guests: number | string;
  }>;

  let total = 0;
  for (const r of raw) {
    const totalPayment = Math.trunc(Number(r.total_payment));
    const heads = Number(r.player_heads) + Number(r.guest_heads);
    const paidCount = Number(r.paid_players) + Number(r.paid_guests);
    if (heads === 0 || totalPayment <= 0) continue;
    const share = Math.ceil(totalPayment / heads);
    const collected = share * paidCount;
    total += Math.max(collected - totalPayment, 0);
  }
  return total;
}

export async function savePaymentTotal(matchId: number, total: number): Promise<void> {
  await sqlClient.query(`UPDATE matches SET total_payment = $1 WHERE id = $2`, [total, matchId]);
}

export async function savePaymentDetails(
  matchId: number,
  details: { name: string; mobile: string; method: string; note: string; payLink: string },
): Promise<void> {
  await sqlClient.query(
    `UPDATE matches SET payment_name = $1, payment_mobile = $2, payment_method = $3, payment_note = $4, pay_link = $5 WHERE id = $6`,
    [
      details.name.trim(),
      details.mobile.trim(),
      details.method.trim(),
      details.note.trim(),
      details.payLink.trim(),
      matchId,
    ],
  );
}

export async function setPaid(matchId: number, playerId: number, paid: boolean): Promise<void> {
  await sqlClient.query(
    `INSERT INTO payments(match_id, player_id, paid, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       paid = EXCLUDED.paid,
       updated_at = CURRENT_TIMESTAMP`,
    [matchId, playerId, paid ? 1 : 0],
  );
}

export async function resetAllUnpaid(matchId: number): Promise<void> {
  await sqlClient.query(
    `UPDATE payments SET paid = 0, updated_at = CURRENT_TIMESTAMP WHERE match_id = $1`,
    [matchId],
  );
}

/** Open or close self-service payments for a match (players see it on their tab). */
export async function setPaymentsActive(matchId: number, active: boolean): Promise<void> {
  await sqlClient.query(`UPDATE matches SET payments_active = $1 WHERE id = $2`, [
    active ? 1 : 0,
    matchId,
  ]);
}

/** Whether self-service payments are currently open for a match. */
export async function isPaymentsActive(matchId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT COALESCE(payments_active, 0) AS a FROM matches WHERE id = $1`,
    [matchId],
  )) as unknown as { a: number }[];
  return Number(rows[0]?.a ?? 0) === 1;
}

/** Is the player on the confirmed roster for a match? */
export async function isPlayerInMatch(matchId: number, playerId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM match_players WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  )) as unknown as unknown[];
  return rows.length > 0;
}

/** Does the player host this guest for this match? */
export async function playerHostsGuest(
  matchId: number,
  playerId: number,
  guestId: number,
): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM match_guests WHERE id = $1 AND match_id = $2 AND host_player_id = $3 AND status = 'approved'`,
    [guestId, matchId, playerId],
  )) as unknown as unknown[];
  return rows.length > 0;
}

export interface PlayerGuestPayment {
  id: number;
  name: string;
  paid: boolean;
}

export interface PlayerPaymentMatch {
  matchId: number;
  playedOn: string;
  paymentName: string;
  paymentMobile: string;
  paymentMethod: string;
  paymentNote: string;
  payLink: string;
  totalPayment: number;
  share: number;
  inRoster: boolean;
  paid: boolean;
  guests: PlayerGuestPayment[];
}

/**
 * Build the payment view for one match from the player's perspective. Assumes
 * the caller has already decided the player is involved; returns null only if
 * the match/meta is missing.
 */
async function buildPlayerPaymentMatch(
  matchId: number,
  playerId: number,
): Promise<PlayerPaymentMatch | null> {
  const [meta, rows] = await Promise.all([getPaymentMeta(matchId), getPaymentRows(matchId)]);
  if (!meta) return null;
  const guestRows = (await sqlClient.query(
    `SELECT id, name, host_player_id, paid FROM match_guests WHERE match_id = $1 AND status = 'approved'`,
    [matchId],
  )) as unknown as { id: number; name: string; host_player_id: number; paid: number }[];
  const summary = computeSummary(
    rows,
    meta.totalPayment,
    guestRows.map((g) => g.paid === 1),
  );
  const mine = rows.find((r) => r.playerId === playerId);
  const myGuests = guestRows.filter((g) => g.host_player_id === playerId);
  return {
    matchId,
    playedOn: meta.playedOn,
    paymentName: meta.paymentName,
    paymentMobile: meta.paymentMobile,
    paymentMethod: meta.paymentMethod,
    paymentNote: meta.paymentNote,
    payLink: meta.payLink,
    totalPayment: meta.totalPayment,
    share: summary.sharePerPlayer,
    inRoster: Boolean(mine),
    paid: mine?.paid ?? false,
    guests: myGuests.map((g) => ({ id: g.id, name: g.name, paid: g.paid === 1 })),
  };
}

/**
 * The player's payment view for one match, or null when payments are closed or
 * the player has nothing to pay (not on the roster and no guests).
 */
export async function getPlayerPaymentForMatch(
  matchId: number,
  playerId: number,
): Promise<PlayerPaymentMatch | null> {
  if (!(await isPaymentsActive(matchId))) return null;
  const view = await buildPlayerPaymentMatch(matchId, playerId);
  if (!view) return null;
  if (!view.inRoster && view.guests.length === 0) return null;
  return view;
}

/**
 * Every match with self-service payments open that the player is involved in
 * (on the roster, or hosting a guest), with their own share, paid status and
 * their guests' paid status.
 */
export async function getPlayerPaymentMatches(playerId: number): Promise<PlayerPaymentMatch[]> {
  const matchRows = (await sqlClient.query(
    `SELECT DISTINCT m.id
       FROM matches m
       LEFT JOIN match_players mp ON mp.match_id = m.id AND mp.player_id = $1
       LEFT JOIN match_guests mg ON mg.match_id = m.id AND mg.host_player_id = $1 AND mg.status = 'approved'
      WHERE COALESCE(m.payments_active, 0) = 1
        AND (mp.player_id IS NOT NULL OR mg.host_player_id IS NOT NULL)
      ORDER BY m.id DESC`,
    [playerId],
  )) as unknown as { id: number }[];

  const result: PlayerPaymentMatch[] = [];
  for (const { id } of matchRows) {
    const view = await buildPlayerPaymentMatch(id, playerId);
    if (view) result.push(view);
  }
  return result;
}
