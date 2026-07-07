"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  approveStatsSubmission,
  rejectStatsSubmission,
  backfillApprovedStats,
} from "@/lib/stats";
import { notify } from "@/lib/push";

export interface StatsReviewState {
  ok: boolean;
  message: string;
}

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
  return session?.user?.name ?? "admin";
}

const submissionIdSchema = z.coerce.number().int().positive();
const countSchema = z.coerce.number().int().min(0).max(50);

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join(" ");
  return err instanceof Error ? err.message : "Something went wrong.";
}

export async function approveSubmissionAction(
  _prev: StatsReviewState,
  formData: FormData,
): Promise<StatsReviewState> {
  try {
    const actor = await requireAdmin();
    const submissionId = submissionIdSchema.parse(formData.get("submissionId"));
    const goals = countSchema.parse(formData.get("goals"));
    const assists = countSchema.parse(formData.get("assists"));

    const ok = await approveStatsSubmission(submissionId, actor, { goals, assists });
    if (!ok) return { ok: false, message: "Submission not found." };

    // Let the player know their stats went through (never block on push).
    try {
      await notify(
        "stats_approved",
        {
          title: "Stats approved \u2705",
          body: `Your ${goals} goal${goals === 1 ? "" : "s"} and ${assists} assist${assists === 1 ? "" : "s"} were approved.`,
          url: `/matches/${ok.matchId}/stats`,
          tag: `stats-approved-${submissionId}`,
        },
        { playerIds: [ok.playerId] },
      );
    } catch {
      // ignore push errors
    }

    revalidatePath("/stats");
    revalidatePath("/leaderboard");
    return { ok: true, message: "Submission approved." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function rejectSubmissionAction(
  _prev: StatsReviewState,
  formData: FormData,
): Promise<StatsReviewState> {
  try {
    const actor = await requireAdmin();
    const submissionId = submissionIdSchema.parse(formData.get("submissionId"));

    const ok = await rejectStatsSubmission(submissionId, actor);
    if (!ok) return { ok: false, message: "Submission not found." };

    revalidatePath("/stats");
    revalidatePath("/leaderboard");
    return { ok: true, message: "Submission rejected." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function backfillStatsAction(
  _prev: StatsReviewState,
  formData: FormData,
): Promise<StatsReviewState> {
  try {
    await requireAdmin();
    const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
    if (confirm !== "BACKFILL") {
      return { ok: false, message: 'Type "BACKFILL" to confirm.' };
    }

    const count = await backfillApprovedStats();
    revalidatePath("/stats");
    revalidatePath("/leaderboard");
    return { ok: true, message: `Backfilled ${count} approved stat row(s).` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
