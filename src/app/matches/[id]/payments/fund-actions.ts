"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addAdjustment,
  deleteAdjustment,
  deleteCharge,
  generateGuestCharges,
  setChargeKind,
  setChargePaid,
  setMatchExtended,
} from "@/lib/season-fund";

export type FundActionState = { ok: boolean; message: string };

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  const role = session?.user?.role;
  return role === "admin" || role === "super" ? null : "Not allowed.";
}

function revalidateMatch(matchId: number): void {
  revalidatePath(`/matches/${matchId}/payments`);
  revalidatePath("/admin/accounts");
  revalidatePath("/season");
}

export async function generateChargesAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(matchId)) return { ok: false, message: "Invalid match." };

  const created = await generateGuestCharges(matchId);
  revalidateMatch(matchId);
  return {
    ok: true,
    message:
      created === 0
        ? "Everyone who owes already has a charge."
        : `Raised ${created} charge(s).`,
  };
}

export async function setExtendedAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(matchId)) return { ok: false, message: "Invalid match." };
  const extended = formData.get("extended") === "true";

  await setMatchExtended(matchId, extended);
  revalidateMatch(matchId);
  return {
    ok: true,
    message: extended ? "Marked as extended to 2 hours." : "Extension removed.",
  };
}

export async function setChargePaidAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const chargeId = Number(formData.get("chargeId"));
  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(chargeId)) return { ok: false, message: "Invalid charge." };

  await setChargePaid(chargeId, formData.get("paid") === "true");
  revalidateMatch(matchId);
  return { ok: true, message: "Updated." };
}

export async function setChargeKindAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const chargeId = Number(formData.get("chargeId"));
  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(chargeId)) return { ok: false, message: "Invalid charge." };

  const kind = formData.get("kind") === "replacement" ? "replacement" : "extra";
  const owedRaw = formData.get("owedToPlayerId");
  const owedTo = owedRaw ? Number(owedRaw) : null;

  if (kind === "replacement" && (owedTo == null || !Number.isInteger(owedTo))) {
    return { ok: false, message: "Pick which subscriber they are covering for." };
  }

  await setChargeKind(chargeId, kind, owedTo);
  revalidateMatch(matchId);
  return {
    ok: true,
    message:
      kind === "replacement"
        ? "Marked as a replacement — settled between the two players."
        : "Marked as an extra player — pays the group fund.",
  };
}

export async function deleteChargeAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const chargeId = Number(formData.get("chargeId"));
  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(chargeId)) return { ok: false, message: "Invalid charge." };

  await deleteCharge(chargeId);
  revalidateMatch(matchId);
  return { ok: true, message: "Charge removed." };
}

export async function addAdjustmentAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const seasonId = Number(formData.get("seasonId"));
  const note = String(formData.get("note") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);

  if (!Number.isInteger(seasonId)) return { ok: false, message: "Invalid season." };
  if (!note) return { ok: false, message: "Say what the adjustment is for." };
  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, message: "Enter an amount, negative to spend from the fund." };
  }

  const session = await auth();
  await addAdjustment(
    seasonId,
    Math.round(amount * 100),
    note,
    session?.user?.name ?? "admin",
  );
  revalidatePath("/admin/accounts");
  revalidatePath("/season");
  return { ok: true, message: "Adjustment recorded." };
}

export async function deleteAdjustmentAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "Invalid adjustment." };

  await deleteAdjustment(id);
  revalidatePath("/admin/accounts");
  revalidatePath("/season");
  return { ok: true, message: "Adjustment removed." };
}
