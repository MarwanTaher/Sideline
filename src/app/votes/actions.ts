"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addOrUpdateVote,
  autoFlagOutliers,
  deleteVote,
  detectOutliers,
  editVote,
  excludeVote,
  resetVote,
  SCOPE_OPTIONS,
  type OutlierCandidate,
  type OutlierSensitivity,
} from "@/lib/vote-admin";

export interface VoteActionState {
  ok: boolean;
  message: string;
}

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
  return session?.user?.name?.trim() || "admin";
}

const idSchema = z.coerce.number().int();
const ratingSchema = z.coerce.number().int().min(0, "Rating 0–10.").max(10, "Rating 0–10.");
const scopeSchema = z.enum(SCOPE_OPTIONS as [string, ...string[]]);
const keySchema = z.object({
  matchId: idSchema,
  voterId: idSchema,
  votedForId: idSchema,
});

function revalidate(): void {
  revalidatePath("/votes");
  revalidatePath("/leaderboard");
  revalidatePath("/awards");
}

function fail(err: unknown): VoteActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
}

export async function editVoteAction(
  _prev: VoteActionState,
  formData: FormData,
): Promise<VoteActionState> {
  try {
    const actor = await requireAdmin();
    const key = keySchema.parse({
      matchId: formData.get("matchId"),
      voterId: formData.get("voterId"),
      votedForId: formData.get("votedForId"),
    });
    const rating = ratingSchema.parse(formData.get("rating"));
    const scopeStatus = scopeSchema.parse(formData.get("scopeStatus"));
    const include = formData.get("include") === "on";
    await editVote(key, { rating, include, scopeStatus }, actor);
    revalidate();
    return { ok: true, message: "Vote updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function resetVoteAction(
  _prev: VoteActionState,
  formData: FormData,
): Promise<VoteActionState> {
  try {
    const actor = await requireAdmin();
    const key = keySchema.parse({
      matchId: formData.get("matchId"),
      voterId: formData.get("voterId"),
      votedForId: formData.get("votedForId"),
    });
    await resetVote(key, actor);
    revalidate();
    return { ok: true, message: "Vote reset to default." };
  } catch (err) {
    return fail(err);
  }
}

export async function excludeVoteAction(
  _prev: VoteActionState,
  formData: FormData,
): Promise<VoteActionState> {
  try {
    const actor = await requireAdmin();
    const key = keySchema.parse({
      matchId: formData.get("matchId"),
      voterId: formData.get("voterId"),
      votedForId: formData.get("votedForId"),
    });
    await excludeVote(key, actor);
    revalidate();
    return { ok: true, message: "Vote excluded from calculation." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteVoteAction(
  _prev: VoteActionState,
  formData: FormData,
): Promise<VoteActionState> {
  try {
    const actor = await requireAdmin();
    const key = keySchema.parse({
      matchId: formData.get("matchId"),
      voterId: formData.get("voterId"),
      votedForId: formData.get("votedForId"),
    });
    if (formData.get("confirm") !== "DELETE") {
      return { ok: false, message: 'Type DELETE to confirm.' };
    }
    await deleteVote(key, actor);
    revalidate();
    return { ok: true, message: "Vote deleted." };
  } catch (err) {
    return fail(err);
  }
}

export async function addVoteAction(
  _prev: VoteActionState,
  formData: FormData,
): Promise<VoteActionState> {
  try {
    const actor = await requireAdmin();
    const key = keySchema.parse({
      matchId: formData.get("matchId"),
      voterId: formData.get("voterId"),
      votedForId: formData.get("votedForId"),
    });
    if (key.voterId === key.votedForId) {
      return { ok: false, message: "Voter and target must differ." };
    }
    const rating = ratingSchema.parse(formData.get("rating"));
    const scopeStatus = scopeSchema.parse(formData.get("scopeStatus"));
    const include = formData.get("include") === "on";
    await addOrUpdateVote(key, { rating, include, scopeStatus }, actor);
    revalidate();
    return { ok: true, message: "Vote added/updated." };
  } catch (err) {
    return fail(err);
  }
}

const sensitivitySchema = z.enum(["strict", "normal", "lenient"]);

export interface AutoFlagState {
  ok: boolean;
  message: string;
  /** Preview results (null unless a preview just ran). */
  candidates: OutlierCandidate[] | null;
  /** Echoed back so Apply reuses exactly what was previewed. */
  sensitivity: OutlierSensitivity | null;
  matchId: number | null;
}

const AUTO_FLAG_INITIAL: AutoFlagState = {
  ok: false,
  message: "",
  candidates: null,
  sensitivity: null,
  matchId: null,
};

/** Dry-run: detect outliers and return them for review without changing data. */
export async function previewAutoFlagAction(
  _prev: AutoFlagState,
  formData: FormData,
): Promise<AutoFlagState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const sensitivity = sensitivitySchema.parse(
      formData.get("sensitivity"),
    ) as OutlierSensitivity;
    const candidates = await detectOutliers(matchId, sensitivity);
    const toFlag = candidates.filter((c) => !c.alreadyOutOfScope);
    const already = candidates.length - toFlag.length;
    const message =
      toFlag.length === 0
        ? already > 0
          ? `No new outliers — ${already} already out of scope.`
          : "No outliers detected."
        : `Found ${toFlag.length} vote(s) to flag${
            already > 0 ? ` (${already} already out of scope)` : ""
          }. Review below, then apply.`;
    return { ok: true, message, candidates, sensitivity, matchId };
  } catch (err) {
    return { ...AUTO_FLAG_INITIAL, ...fail(err) };
  }
}

/** Apply flags for the given match + sensitivity (same logic as the preview). */
export async function applyAutoFlagAction(
  _prev: AutoFlagState,
  formData: FormData,
): Promise<AutoFlagState> {
  try {
    const actor = await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const sensitivity = sensitivitySchema.parse(
      formData.get("sensitivity"),
    ) as OutlierSensitivity;
    const flagged = await autoFlagOutliers(matchId, sensitivity, actor);
    revalidate();
    return {
      ok: true,
      message: `Out-of-scope detection applied. Flagged ${flagged} vote(s).`,
      candidates: null,
      sensitivity,
      matchId,
    };
  } catch (err) {
    return { ...AUTO_FLAG_INITIAL, ...fail(err) };
  }
}
