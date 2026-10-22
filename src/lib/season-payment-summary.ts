import type { Invoice } from "./season-billing";

export type PlayerInvoiceSummary = {
  /** Unpaid bills the player still has to send. */
  toSend: Invoice[];
  /** Bills the player says they sent, waiting for an admin. */
  sent: Invoice[];
  /** Settled bills: confirmed paid, or fully covered by credit. */
  previous: Invoice[];
  toSendMinor: number;
  sentMinor: number;
  /** Earliest deadline among the bills still to send. */
  nextDueAtMs: number | null;
};

/** Split a player's visible bills into what to pay now and what is settled. */
export function summarizePlayerInvoices(invoices: Invoice[]): PlayerInvoiceSummary {
  const open = invoices.filter((i) => i.paidAt == null && i.totalMinor > 0);
  const toSend = open
    .filter((i) => i.declaredPaidAt == null)
    .sort((a, b) => a.period.localeCompare(b.period));
  const sent = open
    .filter((i) => i.declaredPaidAt != null)
    .sort((a, b) => a.period.localeCompare(b.period));
  const openIds = new Set(open.map((i) => i.id));
  const previous = invoices
    .filter((i) => !openIds.has(i.id))
    .sort((a, b) => b.period.localeCompare(a.period));
  const dues = toSend
    .map((i) => i.dueAtMs)
    .filter((ms): ms is number => ms != null);
  return {
    toSend,
    sent,
    previous,
    toSendMinor: toSend.reduce((sum, i) => sum + i.totalMinor, 0),
    sentMinor: sent.reduce((sum, i) => sum + i.totalMinor, 0),
    nextDueAtMs: dues.length > 0 ? Math.min(...dues) : null,
  };
}

/**
 * One transfer title for every bill paid together, so an admin can match the
 * transfer without asking: "Sideline 2026-11 Player" or
 * "Sideline 2026-11+12 Player" (same year collapses to the month number).
 */
export function combinedTransferReference(playerName: string, periods: string[]): string {
  const sorted = [...new Set(periods)].sort();
  let label = "";
  for (let i = 0; i < sorted.length; i++) {
    const [year, month] = sorted[i].split("-");
    const prevYear = i > 0 ? sorted[i - 1].split("-")[0] : null;
    label += i === 0 ? sorted[i] : prevYear === year ? `+${month}` : `+${sorted[i]}`;
  }
  return `Sideline ${label} ${playerName}`.replace(/\s+/g, " ").trim();
}

/** "2026-11" → "November 2026". */
export function monthLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
