"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logAppError } from "@/lib/error-log";
import {
  addAdjustment,
  deleteAdjustment,
  deleteCharge,
  syncGuestCharges,
  setChargeKind,
  setChargePaid,
  setMatchExtended,
  recordMatchdaySettlement,
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
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/availability`);
}

export async function syncChargesAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(matchId)) return { ok: false, message: "Invalid match." };

  const { created, removed } = await syncGuestCharges(matchId);
  revalidateMatch(matchId);
  const parts = [
    created > 0 ? `raised ${created} charge${created === 1 ? "" : "s"}` : "",
    removed > 0 ? `removed ${removed} that no longer appl${removed === 1 ? "ies" : "y"}` : "",
  ].filter(Boolean);
  return {
    ok: true,
    message:
      parts.length === 0
        ? "Charges already match who is playing."
        : `Synced: ${parts.join(", ")}.`,
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

  try {
    await setMatchExtended(matchId, extended);
  } catch (error) {
    await logAppError(error, "matches.extension");
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the extension." };
  }
  revalidateMatch(matchId);
  return {
    ok: true,
    message: extended ? "Optional extension confirmed." : "Extension removed.",
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

/** P2.3: record what the group actually paid the facility for this matchday. */
export async function recordSettlementAction(
  _prev: FundActionState,
  formData: FormData,
): Promise<FundActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, message: denied };

  const matchId = Number(formData.get("matchId"));
  if (!Number.isInteger(matchId) || matchId <= 0) return { ok: false, message: "Invalid match." };
  const paid = Number(String(formData.get("paid") ?? "").replace(",", "."));
  if (!Number.isFinite(paid) || paid < 0) {
    return { ok: false, message: "Enter the amount paid to the facility (PLN)." };
  }
  const scansRaw = String(formData.get("facilityScans") ?? "").trim();
  const facilityScans = scansRaw === "" ? null : Number(scansRaw);
  if (facilityScans != null && (!Number.isInteger(facilityScans) || facilityScans < 0)) {
    return { ok: false, message: "Scan count must be a whole number, or leave it empty." };
  }

  const session = await auth();
  const saved = await recordMatchdaySettlement(
    matchId,
    { paidMinor: Math.round(paid * 100), facilityScans, note: String(formData.get("note") ?? "") },
    session?.user?.name ?? "admin",
  );
  if (!saved) return { ok: false, message: "Only season matches have a facility settlement." };
  revalidateMatch(matchId);
  return { ok: true, message: "Facility payment recorded." };
}
