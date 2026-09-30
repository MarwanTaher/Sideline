"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  deleteInvoice,
  generateInvoices,
  setInvoicePaid,
  setInvoicePlayingDays,
} from "@/lib/season-billing";
import { reviewScan, reportScan, withdrawScan } from "@/lib/multisport";
import { getSubscriptionSeason } from "@/lib/season-subscriptions";
import { sqlClient } from "@/lib/db";

export type BillingActionState = { ok: boolean; message: string };

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  const role = session?.user?.role;
  return role === "admin" || role === "super" ? null : "Not allowed.";
}

async function actorName(): Promise<string> {
  const session = await auth();
  return session?.user?.name ?? "admin";
}

function revalidateBilling(): void {
  revalidatePath("/admin/accounts");
  revalidatePath("/season");
}

export async function generateInvoicesAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const seasonId = Number(formData.get("seasonId"));
  const period = String(formData.get("period") ?? "");
  if (!Number.isInteger(seasonId) || !/^\d{4}-\d{2}$/.test(period)) {
    return { ok: false, message: "Pick a month in YYYY-MM form." };
  }

  const result = await generateInvoices(seasonId, period);
  if (result.playingDays === 0) {
    return {
      ok: false,
      message: `No playing Sundays fall in ${period} inside the contract period.`,
    };
  }

  revalidateBilling();
  return {
    ok: true,
    message: `${period}: ${result.playingDays} Sundays · ${result.created} invoice(s) raised${
      result.skipped > 0 ? `, ${result.skipped} already existed` : ""
    }.`,
  };
}

export async function setInvoicePaidAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const invoiceId = Number(formData.get("invoiceId"));
  if (!Number.isInteger(invoiceId)) return { ok: false, message: "Invalid invoice." };
  const paid = formData.get("paid") === "true";

  await setInvoicePaid(invoiceId, paid);
  revalidateBilling();
  return { ok: true, message: paid ? "Marked paid." : "Marked unpaid." };
}

export async function setPlayingDaysAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const invoiceId = Number(formData.get("invoiceId"));
  const days = Number(formData.get("playingDays"));
  if (!Number.isInteger(invoiceId) || !Number.isInteger(days) || days < 0 || days > 6) {
    return { ok: false, message: "Playing days must be between 0 and 6." };
  }

  await setInvoicePlayingDays(invoiceId, days);
  revalidateBilling();
  return { ok: true, message: "Amount recalculated." };
}

export async function deleteInvoiceAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const invoiceId = Number(formData.get("invoiceId"));
  if (!Number.isInteger(invoiceId)) return { ok: false, message: "Invalid invoice." };

  await deleteInvoice(invoiceId);
  revalidateBilling();
  return { ok: true, message: "Invoice deleted; any credits return to the next bill." };
}

export async function reviewScanAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const scanId = Number(formData.get("scanId"));
  if (!Number.isInteger(scanId)) return { ok: false, message: "Invalid scan." };
  const approve = formData.get("approve") === "true";

  await reviewScan(scanId, approve, await actorName());
  revalidateBilling();
  return { ok: true, message: approve ? "Scan approved." : "Scan rejected." };
}

/** Player-facing: report or withdraw your own MultiSport scan. */
export async function reportScanAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return { ok: false, message: "Only player accounts can report a scan." };

  const matchId = Number(formData.get("matchId"));
  const seasonId = Number(formData.get("seasonId"));
  if (!Number.isInteger(matchId) || !Number.isInteger(seasonId)) {
    return { ok: false, message: "Invalid request." };
  }

  if (formData.get("withdraw") === "true") {
    await withdrawScan(matchId, Number(playerId));
    revalidatePath("/season");
    return { ok: true, message: "Scan report withdrawn." };
  }

  // Only someone who actually played can have scanned.
  const played = (await sqlClient.query(
    `SELECT 1 FROM match_availability
      WHERE match_id = $1 AND player_id = $2 AND status = 'in'`,
    [matchId, Number(playerId)],
  )) as unknown[];
  if (played.length === 0) {
    return { ok: false, message: "You weren't marked IN for that match." };
  }

  const season = await getSubscriptionSeason(seasonId);
  if (!season) return { ok: false, message: "Season not found." };

  const creditRows = (await sqlClient.query(
    `SELECT multisport_credit_minor FROM seasons WHERE id = $1`,
    [seasonId],
  )) as Array<{ multisport_credit_minor: number }>;

  await reportScan(matchId, Number(playerId), Number(creditRows[0]?.multisport_credit_minor ?? 1500));
  revalidatePath("/season");
  return { ok: true, message: "Reported — an admin will confirm it." };
}
