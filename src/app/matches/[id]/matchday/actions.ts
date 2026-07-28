"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createRound,
  endRound,
  deleteRound,
  setRoundTimer,
  addGoal,
  deleteGoal,
  syncMatchdayToStats,
  MatchdayError,
} from "@/lib/matchday";

export interface ActionResult {
  ok: boolean;
  message: string;
}
export interface CreateRoundResult extends ActionResult {
  round?: { id: number; roundNo: number; teamA: number; teamB: number };
}
export interface AddGoalResult extends ActionResult {
  goalId?: number;
}

const idSchema = z.coerce.number().int().positive();
const teamSchema = z.coerce.number().int();
const nullableIdSchema = z.coerce.number().int().positive().nullable();
const timerActionSchema = z.enum(["start", "pause", "reset"]);

function fail(err: unknown): ActionResult {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  if (err instanceof MatchdayError) return { ok: false, message: err.message };
  return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new MatchdayError("Only admins can run the matchday console.");
  }
}

/** Light revalidation so a fresh visit / other device sees current data. */
function revalidate(matchId: number): void {
  revalidatePath(`/matches/${matchId}/matchday`);
}

export async function createRoundAction(
  matchId: number,
  teamA: number,
  teamB: number,
): Promise<CreateRoundResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(matchId);
    const a = teamSchema.parse(teamA);
    const b = teamSchema.parse(teamB);
    const round = await createRound(mid, a, b);
    revalidate(mid);
    return {
      ok: true,
      message: "",
      round: { id: round.id, roundNo: round.roundNo, teamA: a, teamB: b },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function endRoundAction(matchId: number, roundId: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(matchId);
    await endRound(idSchema.parse(roundId));
    revalidate(mid);
    return { ok: true, message: "" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRoundAction(matchId: number, roundId: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(matchId);
    await deleteRound(idSchema.parse(roundId));
    revalidate(mid);
    return { ok: true, message: "" };
  } catch (err) {
    return fail(err);
  }
}

export async function timerAction(
  matchId: number,
  roundId: number,
  action: "start" | "pause" | "reset",
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(matchId);
    await setRoundTimer(idSchema.parse(roundId), timerActionSchema.parse(action));
    revalidate(mid);
    return { ok: true, message: "" };
  } catch (err) {
    return fail(err);
  }
}

export async function addGoalAction(input: {
  matchId: number;
  roundId: number;
  teamNo: number;
  scorerPlayerId: number | null;
  scorerGuestId: number | null;
  assistPlayerId: number | null;
  assistGuestId: number | null;
}): Promise<AddGoalResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(input.matchId);
    const goalId = await addGoal({
      roundId: idSchema.parse(input.roundId),
      teamNo: teamSchema.parse(input.teamNo),
      scorerPlayerId: nullableIdSchema.parse(input.scorerPlayerId),
      scorerGuestId: nullableIdSchema.parse(input.scorerGuestId),
      assistPlayerId: nullableIdSchema.parse(input.assistPlayerId),
      assistGuestId: nullableIdSchema.parse(input.assistGuestId),
    });
    revalidate(mid);
    return { ok: true, message: "", goalId };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGoalAction(matchId: number, goalId: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(matchId);
    await deleteGoal(idSchema.parse(goalId));
    revalidate(mid);
    return { ok: true, message: "" };
  } catch (err) {
    return fail(err);
  }
}

export async function syncStatsAction(matchId: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const mid = idSchema.parse(matchId);
    const n = await syncMatchdayToStats(mid);
    revalidate(mid);
    revalidatePath(`/matches/${mid}/stats`);
    revalidatePath("/leaderboard");
    return { ok: true, message: `Synced ${n} player${n === 1 ? "" : "s"} to match stats.` };
  } catch (err) {
    return fail(err);
  }
}
