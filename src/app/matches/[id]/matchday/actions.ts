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

export interface MatchdayActionState {
  ok: boolean;
  message: string;
}

const idSchema = z.coerce.number().int().positive();
const teamSchema = z.coerce.number().int();
const timerActionSchema = z.enum(["start", "pause", "reset"]);

function fail(err: unknown): MatchdayActionState {
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

function revalidate(matchId: number): void {
  revalidatePath(`/matches/${matchId}/matchday`);
  revalidatePath(`/matches/${matchId}`);
}

/** Parse "p:<id>" | "g:<id>" | "" into a player/guest id pair. */
function parsePerson(raw: unknown): { playerId: number | null; guestId: number | null } {
  const s = String(raw ?? "").trim();
  if (s === "") return { playerId: null, guestId: null };
  const [kind, idStr] = s.split(":");
  const id = idSchema.parse(idStr);
  if (kind === "p") return { playerId: id, guestId: null };
  if (kind === "g") return { playerId: null, guestId: id };
  throw new MatchdayError("Invalid player selection.");
}

export async function createRoundAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const teamA = teamSchema.parse(formData.get("teamA"));
    const teamB = teamSchema.parse(formData.get("teamB"));
    await createRound(matchId, teamA, teamB);
    revalidate(matchId);
    return { ok: true, message: "Round started." };
  } catch (err) {
    return fail(err);
  }
}

export async function endRoundAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const roundId = idSchema.parse(formData.get("roundId"));
    await endRound(roundId);
    revalidate(matchId);
    return { ok: true, message: "Round ended." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRoundAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const roundId = idSchema.parse(formData.get("roundId"));
    await deleteRound(roundId);
    revalidate(matchId);
    return { ok: true, message: "Round deleted." };
  } catch (err) {
    return fail(err);
  }
}

export async function timerAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const roundId = idSchema.parse(formData.get("roundId"));
    const action = timerActionSchema.parse(formData.get("timerAction"));
    await setRoundTimer(roundId, action);
    revalidate(matchId);
    return { ok: true, message: "" };
  } catch (err) {
    return fail(err);
  }
}

export async function addGoalAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const roundId = idSchema.parse(formData.get("roundId"));
    const teamNo = teamSchema.parse(formData.get("teamNo"));
    const scorer = parsePerson(formData.get("scorer"));
    const assist = parsePerson(formData.get("assist"));
    await addGoal({
      roundId,
      teamNo,
      scorerPlayerId: scorer.playerId,
      scorerGuestId: scorer.guestId,
      assistPlayerId: assist.playerId,
      assistGuestId: assist.guestId,
    });
    revalidate(matchId);
    return { ok: true, message: "Goal logged." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGoalAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const goalId = idSchema.parse(formData.get("goalId"));
    await deleteGoal(goalId);
    revalidate(matchId);
    return { ok: true, message: "Goal removed." };
  } catch (err) {
    return fail(err);
  }
}

export async function syncStatsAction(
  _prev: MatchdayActionState,
  formData: FormData,
): Promise<MatchdayActionState> {
  try {
    await requireAdmin();
    const matchId = idSchema.parse(formData.get("matchId"));
    const n = await syncMatchdayToStats(matchId);
    revalidate(matchId);
    revalidatePath(`/matches/${matchId}/stats`);
    revalidatePath("/leaderboard");
    return { ok: true, message: `Synced ${n} player${n === 1 ? "" : "s"} to match stats.` };
  } catch (err) {
    return fail(err);
  }
}
