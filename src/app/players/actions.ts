"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  activatePlayer,
  approveResetRequest,
  bulkDelete,
  bulkSetActive,
  bulkSetPosition,
  createPlayer,
  deletePlayer,
  restorePlayer,
  dismissResetRequest,
  importPlayers,
  parsePlayersCsv,
  updatePlayer,
} from "@/lib/players-admin";
import { createPlayerAccessToken, revokePlayerAccessTokens } from "@/lib/access-tokens";
import { revalidateScores } from "@/lib/scores-cache";

export interface PlayerActionState {
  ok: boolean;
  message: string;
  link?: string;
}

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
  return session?.user?.name ?? "admin";
}

const playerIdSchema = z.coerce.number().int().positive();
const nameSchema = z.string().trim().min(1, "Player name is required.");
const positionSchema = z.enum(["GK", "DEF", "MID", "FWD"]);

function fail(err: unknown): PlayerActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  return {
    ok: false,
    message: err instanceof Error ? err.message : "Something went wrong.",
  };
}

export async function addPlayerAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const name = nameSchema.parse(formData.get("name"));
    const position = positionSchema.parse(formData.get("position"));
    await createPlayer(name, position);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: `Added ${name}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function savePlayerAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const position = positionSchema.parse(formData.get("position"));
    const active = formData.get("active") === "on";
    await updatePlayer(playerId, position, active);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function activatePlayerAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    await activatePlayer(playerId);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: "Player activated." };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePlayerAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const confirm = String(formData.get("confirm") ?? "");
    if (confirm !== "DELETE") {
      return { ok: false, message: 'Type DELETE to confirm removal.' };
    }
    await deletePlayer(playerId);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: "Player removed. You can restore them from Deleted players." };
  } catch (err) {
    return fail(err);
  }
}

export async function restorePlayerAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    await restorePlayer(playerId);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: "Player restored." };
  } catch (err) {
    return fail(err);
  }
}

export async function approveResetAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const token = await approveResetRequest(playerId);
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    const base = host ? `${proto}://${host}` : "";
    const link = `${base}/reset?token=${token}`;
    revalidatePath("/players");
    return { ok: true, message: "Reset link generated. Share it with the player:", link };
  } catch (err) {
    return fail(err);
  }
}

export async function dismissResetAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    const actor = await requireAdmin();
    const requestId = playerIdSchema.parse(formData.get("requestId"));
    await dismissResetRequest(requestId, actor);
    revalidatePath("/players");
    return { ok: true, message: "Request dismissed." };
  } catch (err) {
    return fail(err);
  }
}

export async function generateMagicLinkAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const token = await createPlayerAccessToken(playerId);
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    const base = host ? `${proto}://${host}` : "";
    const link = `${base}/magic?token=${token}`;
    return { ok: true, message: "Magic sign-in link generated. Share it with the player:", link };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeMagicLinksAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const n = await revokePlayerAccessTokens(playerId);
    revalidatePath("/players");
    return {
      ok: true,
      message:
        n === 0
          ? "No active links to revoke."
          : `Revoked ${n} active link${n === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

const idListSchema = z
  .array(z.coerce.number().int().positive())
  .min(1, "Select at least one player.");

function parseIds(formData: FormData): number[] {
  const raw = String(formData.get("ids") ?? "");
  return idListSchema.parse(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function bulkEditAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const ids = parseIds(formData);
    const activeChoice = String(formData.get("activeChoice") ?? "no-change");
    const positionChoice = String(formData.get("positionChoice") ?? "no-change");
    if (activeChoice === "no-change" && positionChoice === "no-change") {
      return { ok: false, message: "Choose at least one edit to apply." };
    }
    if (activeChoice === "active" || activeChoice === "inactive") {
      await bulkSetActive(ids, activeChoice === "active");
    }
    if (positionChoice !== "no-change") {
      const pos = positionSchema.parse(positionChoice);
      await bulkSetPosition(ids, pos);
    }
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: `Bulk edits applied to ${ids.length} player(s).` };
  } catch (err) {
    return fail(err);
  }
}

export async function bulkRemoveAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const ids = parseIds(formData);
    if (String(formData.get("confirm") ?? "") !== "DELETE") {
      return { ok: false, message: "Type DELETE to confirm bulk removal." };
    }
    await bulkDelete(ids);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: `Removed ${ids.length} player(s).` };
  } catch (err) {
    return fail(err);
  }
}

export async function importCsvAction(
  _prev: PlayerActionState,
  formData: FormData,
): Promise<PlayerActionState> {
  try {
    await requireAdmin();
    const text = String(formData.get("csv") ?? "");
    if (!text.trim()) return { ok: false, message: "Paste or upload CSV content first." };
    const rows = parsePlayersCsv(text);
    if (rows.length === 0) return { ok: false, message: "No valid player rows found." };
    const n = await importPlayers(rows);
    revalidateScores();
    revalidatePath("/players");
    revalidatePath("/leaderboard");
    return { ok: true, message: `Imported / updated ${n} player(s).` };
  } catch (err) {
    return fail(err);
  }
}
