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
}

export async function getPaymentMeta(matchId: number): Promise<PaymentMeta | null> {
  const raw = (await sqlClient.query(
    `SELECT id, played_on,
            COALESCE(total_payment, 0) AS total_payment,
            COALESCE(payment_name, '') AS payment_name,
            COALESCE(payment_mobile, '') AS payment_mobile,
            COALESCE(payment_method, '') AS payment_method,
            COALESCE(payment_note, '') AS payment_note
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

/** Mirrors the Streamlit share math: share = ceil(total / players). */
export function computeSummary(rows: PaymentRow[], totalPayment: number): PaymentSummary {
  const totalPlayers = rows.length;
  const paidCount = rows.filter((r) => r.paid).length;
  const sharePerPlayer = totalPlayers > 0 ? Math.ceil(totalPayment / totalPlayers) : 0;
  const collected = sharePerPlayer * paidCount;
  const remaining = Math.max(Math.trunc(totalPayment) - collected, 0);
  return {
    totalPlayers,
    paidCount,
    unpaidCount: totalPlayers - paidCount,
    sharePerPlayer,
    collected,
    remaining,
  };
}

export async function savePaymentTotal(matchId: number, total: number): Promise<void> {
  await sqlClient.query(`UPDATE matches SET total_payment = $1 WHERE id = $2`, [total, matchId]);
}

export async function savePaymentDetails(
  matchId: number,
  details: { name: string; mobile: string; method: string; note: string },
): Promise<void> {
  await sqlClient.query(
    `UPDATE matches SET payment_name = $1, payment_mobile = $2, payment_method = $3, payment_note = $4 WHERE id = $5`,
    [details.name.trim(), details.mobile.trim(), details.method.trim(), details.note.trim(), matchId],
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
