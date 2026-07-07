"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  resetAllUnpaid,
  savePaymentDetails,
  savePaymentTotal,
  setPaid,
} from "@/lib/payments";
import { setGuestPaid } from "@/lib/guests";

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
    revalidatePath("/payments");
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
    await savePaymentDetails(matchId, {
      name: String(formData.get("name") ?? ""),
      mobile: String(formData.get("mobile") ?? ""),
      method: String(formData.get("method") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
    revalidatePath("/payments");
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
    revalidatePath("/payments");
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
    revalidatePath("/payments");
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
    revalidatePath("/payments");
    return { ok: true, message: "All players marked unpaid for this match." };
  } catch (err) {
    return fail(err);
  }
}
