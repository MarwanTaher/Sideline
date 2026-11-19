"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { logAppError } from "@/lib/error-log";
import { parseDueKey, type DueRef } from "@/lib/dues-summary";
import { rejectChargeDeclaration } from "@/lib/dues";
import { clearInvoiceDeclaration, setInvoicePaid } from "@/lib/season-billing";
import { setChargePaid } from "@/lib/season-fund";
import { isSeasonMatch, setPaid } from "@/lib/payments";
import { setGuestPaid } from "@/lib/guests";
import { sendSeasonInvoiceReminder } from "@/lib/season-reminders";

export type InboxActionState = { ok: boolean; message: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  const role = session?.user?.role;
  return role === "admin" || role === "super";
}

const keysSchema = z.array(z.string().max(64)).min(1).max(200);

function parseKeys(formData: FormData): DueRef[] | null {
  const parsed = keysSchema.safeParse(formData.getAll("key").map(String));
  if (!parsed.success) return null;
  const refs = parsed.data.map(parseDueKey);
  return refs.every((r): r is DueRef => r != null) ? refs : null;
}

function revalidateAll(refs: DueRef[]): void {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/accounts");
  revalidatePath("/season");
  revalidatePath("/payments");
  revalidatePath("/");
  for (const r of refs) {
    if (r.kind === "share" || r.kind === "guest_share") revalidatePath(`/matches/${r.matchId}/payments`);
  }
}

/** Mark one due paid in its own system. Pot shares never apply to season matches. */
async function markPaid(ref: DueRef): Promise<boolean> {
  switch (ref.kind) {
    case "invoice":
      await setInvoicePaid(ref.id, true);
      return true;
    case "charge":
      return (await setChargePaid(ref.id, true)).ok;
    case "share":
      if (await isSeasonMatch(ref.matchId)) return false;
      await setPaid(ref.matchId, ref.playerId, true);
      return true;
    case "guest_share":
      if (await isSeasonMatch(ref.matchId)) return false;
      await setGuestPaid(ref.matchId, ref.guestId, true);
      return true;
  }
}

/** Confirm / mark paid one or many dues (the inbox's row and bulk buttons). */
export async function markDuesPaidAction(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  if (!(await requireAdmin())) return { ok: false, message: "Not authorized." };
  const refs = parseKeys(formData);
  if (!refs) return { ok: false, message: "Nothing valid to confirm — refresh the page." };

  try {
    let done = 0;
    for (const ref of refs) if (await markPaid(ref)) done += 1;
    revalidateAll(refs);
    const skipped = refs.length - done;
    return {
      ok: done > 0,
      message:
        `${done} payment${done === 1 ? "" : "s"} marked paid.` +
        (skipped > 0 ? ` ${skipped} skipped (season match pot).` : ""),
    };
  } catch (error) {
    await logAppError(error, "admin.payments.mark-paid");
    return { ok: false, message: "Could not update every payment — refresh and try again." };
  }
}

/** The money never arrived: send a declared season bill back to open. */
export async function rejectDeclarationAction(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  if (!(await requireAdmin())) return { ok: false, message: "Not authorized." };
  const key = String(formData.get("key") ?? "");
  const ref = parseDueKey(key);
  if (ref?.kind !== "invoice" && ref?.kind !== "charge") {
    return { ok: false, message: "Only season bills and session charges can be rejected." };
  }

  const changed =
    ref.kind === "invoice" ? await clearInvoiceDeclaration(ref.id) : await rejectChargeDeclaration(key);
  revalidateAll([ref]);
  return changed
    ? { ok: true, message: "Sent back to the player as unpaid." }
    : { ok: false, message: "This is no longer waiting for confirmation." };
}

/** Push a reminder for an overdue season bill (same as Admin ▸ Billing). */
export async function remindDueAction(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  if (!(await requireAdmin())) return { ok: false, message: "Not authorized." };
  const ref = parseDueKey(String(formData.get("key") ?? ""));
  if (ref?.kind !== "invoice") return { ok: false, message: "Reminders are for season bills only." };

  const sent = await sendSeasonInvoiceReminder(ref.id);
  return sent
    ? { ok: true, message: "Reminder sent." }
    : { ok: false, message: "This bill is paid, already declared, or no longer exists." };
}
