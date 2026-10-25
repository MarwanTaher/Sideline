import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import { sanitizeErrorMessage } from "@/lib/error-sanitization";
import { getLeaderboard } from "@/lib/leaderboard";
import { toCsv, type CsvValue } from "@/lib/export-csv";

export const dynamic = "force-dynamic";

type ExportDataset = "matches" | "scores" | "invoices" | "fund-ledger";

function csvResponse(dataset: ExportDataset, headers: CsvValue[], rows: CsvValue[][]) {
  return new Response(toCsv(headers, rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sideline-${dataset}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function asTimestamp(value: string | Date | null): string {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : value;
}

async function exportMatches() {
  const rows = await db
    .select({
      id: schema.matches.id,
      playedOn: schema.matches.playedOn,
      kickoffAt: schema.matches.kickoffAt,
      status: schema.matches.status,
      matchdayStatus: schema.matches.matchdayStatus,
      numTeams: schema.matches.numTeams,
      teamSize: schema.matches.teamSize,
      teamNames: schema.matches.teamNames,
      venue: schema.matches.venue,
    })
    .from(schema.matches)
    .orderBy(desc(schema.matches.playedOn), desc(schema.matches.id));
  return csvResponse(
    "matches",
    ["match_id", "played_on", "kickoff_at", "status", "matchday_status", "teams", "team_size", "team_names", "venue"],
    rows.map((row) => [
      row.id,
      row.playedOn,
      asTimestamp(row.kickoffAt),
      row.status,
      row.matchdayStatus,
      row.numTeams,
      row.teamSize,
      row.teamNames,
      row.venue,
    ]),
  );
}

async function exportScores() {
  const [leaderboard, history] = await Promise.all([
    getLeaderboard(),
    db
      .select({
        snapshotKey: schema.legacyScoreSnapshots.snapshotKey,
        playerId: schema.legacyScoreSnapshots.playerId,
        playerName: schema.players.name,
        final: schema.legacyScoreSnapshots.final,
        peer: schema.legacyScoreSnapshots.peer,
        stat: schema.legacyScoreSnapshots.stat,
        payloadJson: schema.legacyScoreSnapshots.payloadJson,
        modelVersion: schema.legacyScoreSnapshots.modelVersion,
        capturedAt: schema.legacyScoreSnapshots.capturedAt,
      })
      .from(schema.legacyScoreSnapshots)
      .leftJoin(
        schema.players,
        eq(schema.legacyScoreSnapshots.playerId, schema.players.id),
      )
      .orderBy(
        asc(schema.legacyScoreSnapshots.snapshotKey),
        asc(schema.legacyScoreSnapshots.playerId),
      ),
  ]);
  const historicalRows = history.map((row) => {
    let rank: number | null = null;
    let ranked: boolean | null = null;
    try {
      const payload = JSON.parse(row.payloadJson ?? "{}") as {
        rank?: number;
        ranked?: boolean;
      };
      if (Number.isInteger(payload.rank)) rank = payload.rank!;
      if (typeof payload.ranked === "boolean") ranked = payload.ranked;
    } catch {
      // Preserve the historical score even if its optional metadata is malformed.
    }
    return [
      row.snapshotKey,
      asTimestamp(row.capturedAt),
      row.modelVersion,
      rank,
      row.playerId,
      row.playerName,
      "",
      ranked,
      row.peer,
      row.stat,
      row.final,
    ] as CsvValue[];
  });
  return csvResponse(
    "scores",
    ["snapshot_key", "captured_at", "model_version", "rank", "player_id", "player_name", "matches", "ranked", "peer_score", "stat_score", "final_score"],
    [
      ...historicalRows,
      ...leaderboard.rows.map((row, index) => [
        "current",
        "",
        "current",
        index + 1,
        row.id,
        row.name,
        row.matches,
        row.ranked,
        row.peer,
        row.stat,
        row.final,
      ]),
    ],
  );
}

async function exportInvoices() {
  const rows = await db
    .select({
      invoiceId: schema.seasonInvoices.id,
      season: schema.seasons.name,
      player: schema.players.name,
      period: schema.seasonInvoices.period,
      playingDays: schema.seasonInvoices.playingDays,
      dayRateMinor: schema.seasonInvoices.dayRateMinor,
      splitBetween: schema.seasonInvoices.splitBetween,
      grossMinor: schema.seasonInvoices.grossMinor,
      creditMinor: schema.seasonInvoices.creditMinor,
      dueDate: schema.seasonInvoices.dueDate,
      paidAt: schema.seasonInvoices.paidAt,
      declaredPaidAt: schema.seasonInvoices.declaredPaidAt,
    })
    .from(schema.seasonInvoices)
    .innerJoin(schema.seasons, eq(schema.seasonInvoices.seasonId, schema.seasons.id))
    .innerJoin(schema.players, eq(schema.seasonInvoices.playerId, schema.players.id))
    .orderBy(desc(schema.seasonInvoices.period), asc(schema.players.name));
  return csvResponse(
    "invoices",
    ["invoice_id", "season", "player", "period", "playing_days", "day_rate_minor", "split_between", "gross_minor", "credit_minor", "due_date", "payment_status", "paid_at", "declared_paid_at"],
    rows.map((row) => [
      row.invoiceId,
      row.season,
      row.player,
      row.period,
      row.playingDays,
      row.dayRateMinor,
      row.splitBetween,
      row.grossMinor,
      row.creditMinor,
      row.dueDate,
      row.paidAt ? "paid" : row.declaredPaidAt ? "declared" : "unpaid",
      asTimestamp(row.paidAt),
      asTimestamp(row.declaredPaidAt),
    ]),
  );
}

async function exportFundLedger() {
  const [charges, extensions, adjustments, paidInvoices] = await Promise.all([
    db
      .select({
        season: schema.seasons.name,
        matchId: schema.matches.id,
        playedOn: schema.matches.playedOn,
        playerName: schema.players.name,
        guestName: schema.matchGuests.name,
        amountMinor: schema.guestCharges.amountMinor,
        paidAt: schema.guestCharges.paidAt,
        createdAt: schema.guestCharges.createdAt,
      })
      .from(schema.guestCharges)
      .innerJoin(schema.matches, eq(schema.guestCharges.matchId, schema.matches.id))
      .leftJoin(schema.seasons, eq(schema.matches.seasonId, schema.seasons.id))
      .leftJoin(schema.players, eq(schema.guestCharges.playerId, schema.players.id))
      .leftJoin(schema.matchGuests, eq(schema.guestCharges.guestId, schema.matchGuests.id))
      .where(eq(schema.guestCharges.kind, "extra"))
      .orderBy(asc(schema.matches.playedOn), asc(schema.guestCharges.id)),
    db
      .select({
        season: schema.seasons.name,
        matchId: schema.matches.id,
        playedOn: schema.matches.playedOn,
        amountMinor: schema.seasons.extensionCostMinor,
      })
      .from(schema.matches)
      .innerJoin(schema.seasons, eq(schema.matches.seasonId, schema.seasons.id))
      .where(eq(schema.matches.extended, true))
      .orderBy(asc(schema.matches.playedOn), asc(schema.matches.id)),
    db
      .select({
        season: schema.seasons.name,
        amountMinor: schema.fundAdjustments.amountMinor,
        note: schema.fundAdjustments.note,
        createdBy: schema.fundAdjustments.createdBy,
        createdAt: schema.fundAdjustments.createdAt,
      })
      .from(schema.fundAdjustments)
      .innerJoin(schema.seasons, eq(schema.fundAdjustments.seasonId, schema.seasons.id))
      .orderBy(asc(schema.fundAdjustments.createdAt), asc(schema.fundAdjustments.id)),
    db
      .select({
        invoiceId: schema.seasonInvoices.id,
        season: schema.seasons.name,
        grossMinor: schema.seasonInvoices.grossMinor,
        paidAt: schema.seasonInvoices.paidAt,
      })
      .from(schema.seasonInvoices)
      .innerJoin(schema.seasons, eq(schema.seasonInvoices.seasonId, schema.seasons.id))
      .where(isNotNull(schema.seasonInvoices.paidAt))
      .orderBy(asc(schema.seasonInvoices.paidAt), asc(schema.seasonInvoices.id)),
  ]);

  const entries: CsvValue[][] = [
    ...charges.map((row) => [
      "extra_charge",
      row.season,
      row.matchId,
      row.playedOn,
      row.playerName ?? row.guestName,
      row.amountMinor,
      row.paidAt ? "paid" : "outstanding",
      asTimestamp(row.paidAt ?? row.createdAt),
      "",
    ]),
    ...extensions.map((row) => [
      "extension_cost",
      row.season,
      row.matchId,
      row.playedOn,
      "Extended match",
      -row.amountMinor,
      "incurred",
      row.playedOn,
      "",
    ]),
    ...adjustments.map((row) => [
      "adjustment",
      row.season,
      "",
      "",
      "Fund adjustment",
      row.amountMinor,
      "posted",
      asTimestamp(row.createdAt),
      `${row.note} (by ${row.createdBy})`,
    ]),
    ...paidInvoices
      .map((row) => ({
        ...row,
        roundingMinor: Math.ceil(row.grossMinor / 100) * 100 - row.grossMinor,
      }))
      .filter((row) => row.roundingMinor !== 0)
      .map((row) => [
        "invoice_rounding",
        row.season,
        "",
        "",
        `Invoice ${row.invoiceId}`,
        row.roundingMinor,
        "paid",
        asTimestamp(row.paidAt),
        "",
      ]),
  ];
  entries.sort((a, b) => String(a[7] ?? "").localeCompare(String(b[7] ?? "")));
  return csvResponse(
    "fund-ledger",
    ["entry_type", "season", "match_id", "played_on", "reference", "amount_minor", "status", "occurred_at", "note"],
    entries,
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dataset: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return new Response("Unauthorized", { status: 401 });
    if (session.user.role !== "admin" && session.user.role !== "super") {
      return new Response("Forbidden", { status: 403 });
    }
    if (await isTabLockedForCurrentUser("diagnostics")) {
      return new Response("Forbidden", { status: 403 });
    }

    const { dataset } = await params;
    switch (dataset as ExportDataset) {
      case "matches":
        return await exportMatches();
      case "scores":
        return await exportScores();
      case "invoices":
        return await exportInvoices();
      case "fund-ledger":
        return await exportFundLedger();
      default:
        return new Response("Not found", { status: 404 });
    }
  } catch (error) {
    console.error(
      "Admin export failed:",
      sanitizeErrorMessage(error instanceof Error ? error.message : "Unknown error"),
    );
    return new Response("Export unavailable", {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
