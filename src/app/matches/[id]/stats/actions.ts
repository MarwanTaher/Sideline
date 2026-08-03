"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getPlayerStatsState,
  submitPlayerStats,
  approveStatsSubmission,
  setPlayerMatchStats,
} from "@/lib/stats";
import {
  isAutoApproveTrustedEnabled,
  isPlayerTrusted,
} from "@/lib/feature-settings";
import { revalidateScores } from "@/lib/scores-cache";
import { notify } from "@/lib/push";

export interface StatsSubmitState {
  ok: boolean;
  message: string;
}

const matchIdSchema = z.coerce.number().int().positive();
const countSchema = z.coerce
  .number()
  .int()
  .min(0, "Cannot be negative.")
  .max(50, "That looks too high.");

export async function submitStatsAction(
  _prev: StatsSubmitState,
  formData: FormData,
): Promise<StatsSubmitState> {
  try {
    const session = await auth();
    const playerId = session?.user?.playerId;
    // Self-service only — admins (playerId null) cannot submit on someone's behalf here.
    if (!session?.user || playerId == null) {
      return { ok: false, message: "Only players can submit stats." };
    }

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const goals = countSchema.parse(formData.get("goals"));
    const assists = countSchema.parse(formData.get("assists"));

    const state = await getPlayerStatsState(matchId, playerId);
    if (!state) return { ok: false, message: "Match not found." };
    if (!state.onRoster) {
      return { ok: false, message: "You are not on the roster for this match." };
    }
    if (!state.open) {
      return { ok: false, message: "Stat submissions are closed for this match." };
    }

    const submissionId = await submitPlayerStats(matchId, playerId, goals, assists);

    // Trusted-player fast path: if an admin has enabled auto-approval AND this
    // player is on the trusted list, approve the submission immediately. The
    // full audit trail is still written by approveStatsSubmission.
    let autoApproved = false;
    if (
      (await isAutoApproveTrustedEnabled()) &&
      (await isPlayerTrusted(playerId))
    ) {
      const result = await approveStatsSubmission(
        submissionId,
        "system:auto-trusted",
      );
      if (result) {
        autoApproved = true;
        revalidateScores();
        try {
          await notify(
            "stats_approved",
            {
              title: "Stats approved \u2705",
              body: `Your ${goals} goal${goals === 1 ? "" : "s"} and ${assists} assist${assists === 1 ? "" : "s"} were auto-approved.`,
              url: `/matches/${matchId}/stats`,
              tag: `stats-approved-${submissionId}`,
            },
            { playerIds: [playerId] },
          );
        } catch {
          // ignore push errors
        }
      }
    }

    revalidatePath(`/matches/${matchId}/stats`);
    revalidatePath(`/matches/${matchId}`);
    return {
      ok: true,
      message: autoApproved
        ? "Stats submitted and auto-approved."
        : "Stats submitted for review.",
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

const playerIdSchema = z.coerce.number().int().positive();

/**
 * Admin direct edit of a single roster player's goals/assists for a match.
 * Bypasses the player submission flow and writes straight to the canonical
 * stats (via setPlayerMatchStats), then refreshes scores/leaderboard.
 */
export async function adminSetStatAction(
  _prev: StatsSubmitState,
  formData: FormData,
): Promise<StatsSubmitState> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user || (role !== "admin" && role !== "super")) {
      return { ok: false, message: "Admins only." };
    }

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const goals = countSchema.parse(formData.get("goals"));
    const assists = countSchema.parse(formData.get("assists"));

    await setPlayerMatchStats(
      matchId,
      playerId,
      goals,
      assists,
      session.user.name ?? `admin:${session.user.id ?? "?"}`,
    );

    revalidateScores();
    revalidatePath(`/matches/${matchId}/stats`);
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/leaderboard");
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

