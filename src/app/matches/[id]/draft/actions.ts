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
  playerId: z.coerce.number().int().positive(),
  teamNo: z.coerce.number().int().min(1).max(3),
  position: positionSchema,
});

const savePayloadSchema = z.object({
  assignments: z.array(assignmentSchema),
  benchPlayerIds: z.array(z.coerce.number().int().positive()),
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

    const count = await autoBalanceDraft(matchId, numTeams);
    revalidatePath(`/matches/${matchId}/draft`);
    revalidatePath(`/matches/${matchId}`);
    return {
      ok: true,
      message:
        count === 0
          ? "No available players to draft."
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
    const { assignments, benchPlayerIds } = savePayloadSchema.parse(raw);

    await saveDraftAssignments(matchId, assignments, benchPlayerIds);
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
    revalidatePath(`/matches/${matchId}/draft`);
    revalidatePath(`/matches/${matchId}`);
    return { ok: true, message: "Draft and match data reset." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
