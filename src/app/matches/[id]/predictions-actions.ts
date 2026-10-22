"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPredictionMatch, isPredictingPlayer, savePrediction } from "@/lib/predictions";
import { predictionWindow } from "@/lib/prediction-rules";
import { logAppError } from "@/lib/error-log";

export interface PredictionActionState {
  ok: boolean;
  message: string;
}

const inputSchema = z.object({
  matchId: z.coerce.number().int().positive(),
  teamNo: z.coerce.number().int().positive(),
});

const LOCKED = "Predictions are locked.";

export async function savePredictionAction(
  _prev: PredictionActionState,
  formData: FormData,
): Promise<PredictionActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!session?.user || playerId == null) {
    return { ok: false, message: "Only players can predict." };
  }

  const parsed = inputSchema.safeParse({
    matchId: formData.get("matchId"),
    teamNo: formData.get("teamNo"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid pick." };
  const { matchId, teamNo } = parsed.data;

  try {
    const [match, validPlayer] = await Promise.all([
      getPredictionMatch(matchId),
      isPredictingPlayer(playerId),
    ]);
    if (!match) return { ok: false, message: "Match not found." };
    if (!validPlayer) return { ok: false, message: "Only players can predict." };

    const window = predictionWindow({
      teamsPublished: match.teamsPublished,
      kickoffMs: match.kickoffMs,
      matchdayStatus: match.matchdayStatus,
      nowMs: Date.now(),
    });
    if (window === "not_open") return { ok: false, message: "Teams aren't published yet." };
    if (window === "locked") return { ok: false, message: LOCKED };
    if (!match.teamNos.includes(teamNo)) return { ok: false, message: "Invalid pick." };

    if (!(await savePrediction(matchId, playerId, teamNo))) {
      return { ok: false, message: LOCKED };
    }
  } catch (error) {
    await logAppError(error, "predictions.save");
    return { ok: false, message: "Couldn't save your pick. Try again." };
  }

  revalidatePath(`/matches/${matchId}`);
  return { ok: true, message: "" };
}
