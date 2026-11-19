"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { declareChargeDues } from "@/lib/dues";
import { parseDueKey } from "@/lib/dues-summary";
import { declareAllInvoicesPaid } from "@/lib/season-billing";

export type PayActionState = { ok: boolean; message: string };

const keysSchema = z.array(z.string().max(64)).min(1).max(100);

/**
 * My payments: "I've paid" (or Undo) for one payee group. Season bills use
 * the existing pay-together declaration (every open bill of that season, an
 * admin confirms); session and replacement charges are declared on the dues
 * ledger. Match-pot shares have their own trusted action on the match card.
 */
export async function declarePaymentsAction(
  _prev: PayActionState,
  formData: FormData,
): Promise<PayActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return { ok: false, message: "Only player accounts can do this." };

  const parsed = keysSchema.safeParse(formData.getAll("key").map(String));
  if (!parsed.success) return { ok: false, message: "Nothing to update — refresh the page." };
  const refs = parsed.data.map((key) => ({ key, ref: parseDueKey(key) }));
  if (refs.some((r) => r.ref == null || r.ref.kind === "share" || r.ref.kind === "guest_share")) {
    return { ok: false, message: "Nothing to update — refresh the page." };
  }

  const undo = formData.get("undo") === "1";
  const note = String(formData.get("note") ?? "").slice(0, 200);
  const invoiceKeys = refs.filter((r) => r.ref?.kind === "invoice");
  const chargeKeys = refs.filter((r) => r.ref?.kind === "charge").map((r) => r.key);

  let changed = 0;
  if (invoiceKeys.length > 0) {
    const seasonId = Number(formData.get("seasonId"));
    if (!Number.isInteger(seasonId) || seasonId <= 0) return { ok: false, message: "Invalid season." };
    changed += await declareAllInvoicesPaid(seasonId, Number(playerId), !undo, note);
  }
  changed += await declareChargeDues(Number(playerId), chargeKeys, undo ? null : note);

  revalidatePath("/payments");
  revalidatePath("/admin/payments");
  revalidatePath("/");
  if (changed === 0) return { ok: false, message: "Nothing to update — refresh the page." };
  return {
    ok: true,
    message: undo ? "Undone. It's open again." : "Marked as sent — an admin confirms when it arrives.",
  };
}
