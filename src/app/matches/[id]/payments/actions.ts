"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  resetAllUnpaid,
  savePaymentDetails,
  savePaymentTotal,
  setPaid,
  setPaymentsActive,
  setPlayerAndGuestsPaid,
  isPaymentsActive,
  isPlayerInMatch,
  playerHostsGuest,
} from "@/lib/payments";
import { setGuestPaid } from "@/lib/guests";
import { DEFAULT_CURRENCY, isPaymentCurrency } from "@/lib/currency";

export interface PaymentActionState {
  ok: boolean;
  message: string;
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
}

const matchIdSchema = z.coerce.number().int().positive();
const playerIdSchema = z.coerce.number().int().positive();
const guestIdSchema = z.coerce.number().int().positive();
const totalSchema = z.coerce.number().min(0, "Must be 0 or more.");

function fail(err: unknown): PaymentActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
}

export async function saveTotalAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const total = totalSchema.parse(formData.get("total"));
    await savePaymentTotal(matchId, total);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: "Total payment updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function saveDetailsAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const currency = String(formData.get("currency") ?? DEFAULT_CURRENCY);
    if (!isPaymentCurrency(currency)) {
      return { ok: false, message: "Pick a currency from the list." };
    }
    await savePaymentDetails(matchId, {
      name: String(formData.get("name") ?? ""),
      mobile: String(formData.get("mobile") ?? ""),
      method: String(formData.get("method") ?? ""),
      note: String(formData.get("note") ?? ""),
      payLink: String(formData.get("payLink") ?? ""),
      currency,
    });
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: "Payment details saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function togglePaidAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const paid = formData.get("paid") === "1";
    await setPaid(matchId, playerId, paid);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: "Updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleGuestPaidAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const guestId = guestIdSchema.parse(formData.get("guestId"));
    const paid = formData.get("paid") === "1";
    await setGuestPaid(matchId, guestId, paid);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: "Updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function resetUnpaidAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    await resetAllUnpaid(matchId);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: "All players marked unpaid for this match." };
  } catch (err) {
    return fail(err);
  }
}

/** Admin: open or close self-service payments for a match. */
export async function setPaymentsActiveAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const active = formData.get("active") === "1";
    await setPaymentsActive(matchId, active);
    revalidatePath(`/matches/${matchId}/payments`);
    return {
      ok: true,
      message: active ? "Payments opened for players." : "Payments closed.",
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Player self-service: mark their OWN payment paid/unpaid. Only allowed while
 * the admin has payments open for the match and only for the signed-in player.
 */
export async function playerSetPaidAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    const session = await auth();
    const playerId = session?.user?.playerId;
    if (playerId == null) {
      return { ok: false, message: "Only player accounts can update payments." };
    }
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const paid = formData.get("paid") === "1";

    if (!(await isPaymentsActive(matchId))) {
      return { ok: false, message: "Payments are closed for this match." };
    }
    if (!(await isPlayerInMatch(matchId, playerId))) {
      return { ok: false, message: "You are not on the roster for this match." };
    }

    await setPaid(matchId, playerId, paid);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: paid ? "Marked as paid." : "Marked as not paid." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Player self-service: one "I've paid" covers the player's own share and every
 * guest they brought (or undoes it). Same open-payments guard as above.
 */
export async function playerSetAllPaidAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    const session = await auth();
    const playerId = session?.user?.playerId;
    if (playerId == null) {
      return { ok: false, message: "Only player accounts can update payments." };
    }
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const paid = formData.get("paid") === "1";

    if (!(await isPaymentsActive(matchId))) {
      return { ok: false, message: "Payments are closed for this match." };
    }

    await setPlayerAndGuestsPaid(matchId, playerId, paid);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: paid ? "Marked as paid." : "Marked as not paid." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Player self-service: mark one of THEIR OWN guests paid/unpaid, subject to the
 * same open-payments guard and host ownership check.
 */
export async function playerSetGuestPaidAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    const session = await auth();
    const playerId = session?.user?.playerId;
    if (playerId == null) {
      return { ok: false, message: "Only player accounts can update payments." };
    }
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const guestId = guestIdSchema.parse(formData.get("guestId"));
    const paid = formData.get("paid") === "1";

    if (!(await isPaymentsActive(matchId))) {
      return { ok: false, message: "Payments are closed for this match." };
    }
    if (!(await playerHostsGuest(matchId, playerId, guestId))) {
      return { ok: false, message: "That guest is not yours." };
    }

    await setGuestPaid(matchId, guestId, paid);
    revalidatePath(`/matches/${matchId}/payments`);
    return { ok: true, message: paid ? "Guest marked as paid." : "Guest marked as not paid." };
  } catch (err) {
    return fail(err);
  }
}
