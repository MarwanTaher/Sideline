/**
 * Client-safe types and pure helpers for the `dues` read model (review §5.1).
 * No database imports: used by pages, client components and unit tests.
 */
import { matchLabel } from "./format";
import { monthLabel } from "./season-payment-summary";

export type DueSource = "match_share" | "season_invoice" | "session_fee" | "replacement";
export type DueStatus = "open" | "declared" | "confirmed";

export type Due = {
  key: string;
  source: DueSource;
  sourceId: number;
  payerPlayerId: number;
  payerName: string;
  /** Set when the due is for a guest the payer hosts. */
  guestName: string | null;
  payee: "group" | "player";
  payeePlayerId: number | null;
  payeeName: string | null;
  matchId: number | null;
  playedOn: string | null;
  seasonId: number | null;
  period: string | null;
  amountMinor: number;
  currency: string;
  status: DueStatus;
  declaredAt: string | null;
  confirmedAt: string | null;
  /** YYYY-MM-DD: invoice due date, or the match day. */
  dueOn: string;
};

export type DueRow = {
  due_key: string;
  source: string;
  source_id: number;
  payer_player_id: number;
  payer_name: string | null;
  guest_name: string | null;
  payee: string;
  payee_player_id: number | null;
  payee_name: string | null;
  match_id: number | null;
  played_on: string | null;
  season_id: number | null;
  period: string | null;
  amount_minor: number;
  currency: string | null;
  status: string;
  declared_at: string | null;
  confirmed_at: string | null;
  due_on: string | null;
};

const SOURCES: DueSource[] = ["match_share", "season_invoice", "session_fee", "replacement"];

export function toDue(r: DueRow): Due {
  const num = (v: number | null) => (v == null ? null : Number(v));
  return {
    key: String(r.due_key),
    source: SOURCES.includes(r.source as DueSource) ? (r.source as DueSource) : "session_fee",
    sourceId: Number(r.source_id),
    payerPlayerId: Number(r.payer_player_id),
    payerName: String(r.payer_name ?? "Unknown"),
    guestName: r.guest_name == null ? null : String(r.guest_name),
    payee: r.payee === "player" ? "player" : "group",
    payeePlayerId: num(r.payee_player_id),
    payeeName: r.payee_name == null ? null : String(r.payee_name),
    matchId: num(r.match_id),
    playedOn: r.played_on == null ? null : String(r.played_on),
    seasonId: num(r.season_id),
    period: r.period == null ? null : String(r.period),
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency ?? "PLN"),
    status: r.status === "confirmed" || r.status === "declared" ? r.status : "open",
    declaredAt: r.declared_at == null ? null : String(r.declared_at),
    confirmedAt: r.confirmed_at == null ? null : String(r.confirmed_at),
    dueOn: String(r.due_on ?? "").slice(0, 10),
  };
}

/** Open and past its due day (the due day itself is not overdue yet). */
export function isOverdue(due: Due, today: string): boolean {
  return due.status === "open" && due.dueOn !== "" && due.dueOn < today;
}

/** "Season · November 2026", "Match Sun 23 Nov · session fee", … */
export function dueTitle(due: Due): string {
  if (due.source === "season_invoice") {
    return `Season · ${due.period ? monthLabel(due.period) : "invoice"}`;
  }
  const match = matchLabel(due.playedOn);
  const what =
    due.source === "match_share"
      ? "match share"
      : due.source === "replacement"
        ? "replacement"
        : "session fee";
  return `${match} · ${what}${due.guestName ? ` (${due.guestName})` : ""}`;
}

/** Who the money goes to, in words. */
export function duePayeeLabel(due: Due): string {
  if (due.payee === "player") return `pay ${due.payeeName ?? "the subscriber"} directly`;
  return due.source === "replacement" && due.payeeName
    ? `pay the group (covering ${due.payeeName})`
    : "pay the group";
}

/** Formats any currency; PLN matches formatMinor. */
export function formatDueAmount(due: Pick<Due, "amountMinor" | "currency">): string {
  const sign = due.amountMinor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(due.amountMinor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} ${due.currency}`;
}

export type DuesBuckets = {
  toPay: Due[];
  waiting: Due[];
  history: Due[];
  overdue: Due[];
  /** Sum of `toPay` per currency, e.g. { PLN: 17900 }. */
  owedByCurrency: Record<string, number>;
};

/**
 * Split dues for display. `toPay` = open, `waiting` = declared, waiting for an
 * admin, `history` = confirmed (newest first), `overdue` ⊂ `toPay`.
 */
export function bucketDues(dues: Due[], today: string): DuesBuckets {
  const byDue = (a: Due, b: Due) => a.dueOn.localeCompare(b.dueOn) || a.key.localeCompare(b.key);
  const toPay = dues.filter((d) => d.status === "open").sort(byDue);
  const waiting = dues.filter((d) => d.status === "declared").sort(byDue);
  const history = dues
    .filter((d) => d.status === "confirmed")
    .sort((a, b) => byDue(b, a));
  const owedByCurrency: Record<string, number> = {};
  for (const d of toPay) owedByCurrency[d.currency] = (owedByCurrency[d.currency] ?? 0) + d.amountMinor;
  return {
    toPay,
    waiting,
    history,
    overdue: toPay.filter((d) => isOverdue(d, today)),
    owedByCurrency,
  };
}

/** "179.00 PLN" or "179.00 PLN + 20.00 EUR"; empty string when nothing is owed. */
export function formatOwed(owed: Record<string, number>): string {
  return Object.entries(owed)
    .filter(([, minor]) => minor > 0)
    .sort(([a], [b]) => (a === "PLN" ? -1 : b === "PLN" ? 1 : a.localeCompare(b)))
    .map(([currency, amountMinor]) => formatDueAmount({ amountMinor, currency }))
    .join(" + ");
}

/** Today's date in club time (Europe/Warsaw), YYYY-MM-DD. */
export function clubToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type DueRef =
  | { kind: "invoice"; id: number }
  | { kind: "charge"; id: number }
  | { kind: "share"; matchId: number; playerId: number }
  | { kind: "guest_share"; matchId: number; guestId: number };

/** Parse a `due_key` from the dues read model; null for anything malformed. */
export function parseDueKey(key: string): DueRef | null {
  const pos = (v: string) => {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  let m = /^(invoice|charge):(\d+)$/.exec(key);
  if (m) {
    const id = pos(m[2]);
    return id == null ? null : { kind: m[1] as "invoice" | "charge", id };
  }
  m = /^share:(\d+):([pg])(\d+)$/.exec(key);
  if (m) {
    const matchId = pos(m[1]);
    const other = pos(m[3]);
    if (matchId == null || other == null) return null;
    return m[2] === "p"
      ? { kind: "share", matchId, playerId: other }
      : { kind: "guest_share", matchId, guestId: other };
  }
  return null;
}
