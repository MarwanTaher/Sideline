"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { saveScoringConfig } from "@/lib/scoring-config";

export interface ScoringConfigState {
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

const nonNegInt = z.coerce.number().int().min(0, "Must be 0 or more.");
const posInt = z.coerce.number().int().min(1, "Must be 1 or more.");
const neutralSchema = z.coerce.number().min(0, "Must be 0–100.").max(100, "Must be 0–100.");
const pctSchema = z.coerce.number().int().min(0, "Must be 0–100.").max(100, "Must be 0–100.");
const aggregateModeSchema = z.coerce.number().int().min(0).max(2);
const priorSchema = z.coerce.number().min(0, "Must be 0 or more.").max(100, "Must be 100 or less.");
const halfLifeSchema = z.coerce.number().int().min(1, "Must be 1 or more.");

export async function saveScoringConfigAction(
  _prev: ScoringConfigState,
  formData: FormData,
): Promise<ScoringConfigState> {
  try {
    await requireAdmin();

    const input = {
      unratedMinMatches: nonNegInt.parse(formData.get("unratedMinMatches")),
      provisionalMinValidPeerVotes: nonNegInt.parse(formData.get("provisionalMinValidPeerVotes")),
      peerFullConfidenceVotes: posInt.parse(formData.get("peerFullConfidenceVotes")),
      matchCountFullConfidence: posInt.parse(formData.get("matchCountFullConfidence")),
      neutralScore: neutralSchema.parse(formData.get("neutralScore")),
      statWeightPct: pctSchema.parse(formData.get("statWeightPct")),
      awardsMatchMinValidVotes: nonNegInt.parse(formData.get("awardsMatchMinValidVotes")),
      awardsOverallMinValidVotes: nonNegInt.parse(formData.get("awardsOverallMinValidVotes")),
      voterNormalization: formData.get("voterNormalization") === "on",
      peerVoteWeighting: formData.get("peerVoteWeighting") === "on",
      peerAggregateMode: aggregateModeSchema.parse(formData.get("peerAggregateMode") ?? 0),
      bayesianShrinkage: formData.get("bayesianShrinkage") === "on",
      bayesianPriorStrength: priorSchema.parse(formData.get("bayesianPriorStrength")),
      recencyDecay: formData.get("recencyDecay") === "on",
      recencyHalfLifeDays: halfLifeSchema.parse(formData.get("recencyHalfLifeDays")),
    };

    await saveScoringConfig(input);

    // Scores + awards depend on this policy; refresh their pages.
    revalidatePath("/scoring");
    revalidatePath("/leaderboard");
    revalidatePath("/awards");
    revalidatePath("/profile");
    return { ok: true, message: "Scoring settings saved." };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}
