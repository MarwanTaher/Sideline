"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  setAwardOverride,
  clearAwardOverride,
  AWARD_TYPES,
  type AwardType,
} from "@/lib/awards";

export interface OverrideActionState {
  ok: boolean;
  message: string;
  awardType?: AwardType;
}

const awardTypeSchema = z.enum(AWARD_TYPES as [AwardType, ...AwardType[]]);
const scopeSchema = z.enum(["match", "overall"]);

/** Server-side authorization gate — never trust the client for this. */
async function requireAdmin(): Promise<string> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
  return (session?.user?.name ?? "admin").trim() || "admin";
}

function parseScope(formData: FormData): { scope: "match" | "overall"; matchId: number | null } {
  const scope = scopeSchema.parse(String(formData.get("scope")));
  if (scope === "overall") return { scope, matchId: null };
  const matchId = z.coerce.number().int().positive().parse(formData.get("matchId"));
  return { scope, matchId };
}

export async function applyOverrideAction(
  _prev: OverrideActionState,
  formData: FormData,
): Promise<OverrideActionState> {
  let awardType: AwardType | undefined;
  try {
    const actor = await requireAdmin();
    awardType = awardTypeSchema.parse(String(formData.get("awardType")));
    const { scope, matchId } = parseScope(formData);

    const reason = z
      .string()
      .trim()
      .min(1, "Reason is required for an override.")
      .parse(formData.get("reason"));

    const winnerIds = z
      .array(z.coerce.number().int().positive())
      .min(1, "Pick at least one winner.")
      .parse(formData.getAll("winnerIds"));

    await setAwardOverride(scope, awardType, winnerIds, reason, actor, matchId);
    revalidatePath("/awards");
    return { ok: true, message: "Override applied.", awardType };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join(" ")
        : err instanceof Error
          ? err.message
          : "Failed to apply override.";
    return { ok: false, message, awardType };
  }
}

export async function clearOverrideAction(
  _prev: OverrideActionState,
  formData: FormData,
): Promise<OverrideActionState> {
  let awardType: AwardType | undefined;
  try {
    const actor = await requireAdmin();
    awardType = awardTypeSchema.parse(String(formData.get("awardType")));
    const { scope, matchId } = parseScope(formData);

    await clearAwardOverride(scope, awardType, actor, matchId);
    revalidatePath("/awards");
    return { ok: true, message: "Override cleared.", awardType };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join(" ")
        : err instanceof Error
          ? err.message
          : "Failed to clear override.";
    return { ok: false, message, awardType };
  }
}
