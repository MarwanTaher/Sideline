"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  autoBalanceDraft,
  saveDraftAssignments,
  resetDraft,
  POSITIONS,
  type Position,
} from "@/lib/draft";
import { revalidateScores } from "@/lib/scores-cache";

export interface DraftActionState {
  ok: boolean;
  message: string;
}

/** Server-side authorization gate — never trust the client for this. */
async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
}

const matchIdSchema = z.coerce.number().int().positive();
const numTeamsSchema = z.coerce.number().int().min(2).max(3);
const positionSchema = z.enum(POSITIONS as unknown as [Position, ...Position[]]);

const assignmentSchema = z.object({
  // Positive ids are real players; negative ids are guests.
  playerId: z.coerce.number().int().refine((n) => n !== 0, "Invalid id."),
  teamNo: z.coerce.number().int().min(1).max(3),
  position: positionSchema,
});

const savePayloadSchema = z.object({
  assignments: z.array(assignmentSchema),
  benchPlayerIds: z.array(z.coerce.number().int().refine((n) => n !== 0, "Invalid id.")),
  teamNames: z.record(z.string(), z.string()).optional(),
});

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => i.message).join(" ");
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

export async function autoBalanceAction(
  _prev: DraftActionState,
  formData: FormData,
): Promise<DraftActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const numTeams = numTeamsSchema.parse(formData.get("numTeams"));
    // A "re-roll" passes a seed to shuffle near-equal players into new sides.
    const reroll = formData.get("reroll") === "1";
    const seed = reroll ? (Date.now() & 0x7fffffff) || 1 : undefined;

    const count = await autoBalanceDraft(matchId, numTeams, seed);
    revalidateScores();
    revalidatePath(`/matches/${matchId}/draft`);
    revalidatePath(`/matches/${matchId}`);
    return {
      ok: true,
      message:
        count === 0
          ? "No available players to draft."
          : reroll
            ? `Re-rolled ${count} players into ${numTeams} new balanced teams.`
            : `Auto-balanced ${count} players into ${numTeams} teams.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function saveDraftAction(
  _prev: DraftActionState,
  formData: FormData,
): Promise<DraftActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    const { assignments, benchPlayerIds, teamNames } = savePayloadSchema.parse(raw);

    const teamNamesMap = teamNames
      ? Object.fromEntries(Object.entries(teamNames).map(([k, v]) => [Number(k), v]))
      : undefined;
    await saveDraftAssignments(matchId, assignments, benchPlayerIds, teamNamesMap);
    revalidateScores();
    revalidatePath(`/matches/${matchId}/draft`);
    revalidatePath(`/matches/${matchId}`);
    return { ok: true, message: "Teams saved." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function resetDraftAction(
  _prev: DraftActionState,
  formData: FormData,
): Promise<DraftActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
    if (confirm !== "RESET") {
      return { ok: false, message: 'Type "RESET" to confirm.' };
    }

    await resetDraft(matchId);
    revalidateScores();
    revalidatePath(`/matches/${matchId}/draft`);
    revalidatePath(`/matches/${matchId}`);
    return { ok: true, message: "Draft and match data reset." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
