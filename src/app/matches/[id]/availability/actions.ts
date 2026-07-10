"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  setPlayerAvailability,
  clearPlayerAvailability,
  getAvailabilityMatch,
  countInPlayers,
} from "@/lib/availability";
import { setAvailabilityOpen, setMaxPlayers } from "@/lib/match-admin";
import { deleteGuestsForHost, countGuests } from "@/lib/guests";

export interface AvailabilityActionState {
  ok: boolean;
  message: string;
}

const matchIdSchema = z.coerce.number().int().positive();
const playerIdSchema = z.coerce.number().int().positive();
const statusSchema = z.enum(["in", "out"]);
// Admins may additionally reset a player back to "pending" (no stored response).
const adminStatusSchema = z.enum(["in", "out", "pending"]);
const maxPlayersSchema = z.coerce
  .number()
  .int()
  .min(1, "Max players must be at least 1.")
  .max(60, "Max players must be 60 or fewer.");

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join(" ");
  return err instanceof Error ? err.message : "Something went wrong.";
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
}

function revalidateAvailability(matchId: number): void {
  revalidatePath(`/matches/${matchId}/availability`);
  revalidatePath(`/matches/${matchId}/draft`);
}

export async function setAvailabilityAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, message: "Sign in to set your availability." };
    }

    // Self-only: a player may only set their OWN availability. Never trust a
    // client-supplied player id — always use the authenticated player.
    const playerId = session.user.playerId;
    if (playerId == null) {
      return { ok: false, message: "Only player accounts can set availability." };
    }

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const status = statusSchema.parse(String(formData.get("status")));

    // Availability is only collected while the admin has it open.
    const match = await getAvailabilityMatch(matchId);
    if (!match) {
      return { ok: false, message: "Match not found." };
    }
    if (!match.availabilityOpen) {
      return { ok: false, message: "Availability is closed for this match." };
    }

    // Enforce the per-match cap when a player marks themselves IN. The cap
    // counts the whole squad — players marked IN plus their guests — because
    // that is what fills the available spots (and what the "In / max" figure
    // shows). A player moving to IN is always transitioning from out/pending
    // (the IN button is disabled when they are already in), so it always adds
    // one to the count.
    if (status === "in") {
      const [inCount, guestCount] = await Promise.all([
        countInPlayers(matchId),
        countGuests(matchId),
      ]);
      if (inCount + guestCount >= match.maxPlayers) {
        return {
          ok: false,
          message: `Match is full (${match.maxPlayers} players). Ask an admin if you need in.`,
        };
      }
    }

    await setPlayerAvailability(matchId, playerId, status);
    if (status === "out") {
      // Guests follow their host — if the host is out, so are their guests.
      await deleteGuestsForHost(matchId, playerId);
    }
    revalidateAvailability(matchId);
    return {
      ok: true,
      message: status === "in" ? "You're marked IN." : "You're marked OUT.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Admin override: set any player's availability. Bypasses the open/closed
 * switch and the per-match cap — the admin is in full control.
 */
export async function adminSetAvailabilityAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const playerId = playerIdSchema.parse(formData.get("playerId"));
    const status = adminStatusSchema.parse(String(formData.get("status")));

    const match = await getAvailabilityMatch(matchId);
    if (!match) {
      return { ok: false, message: "Match not found." };
    }

    if (status === "pending") {
      await clearPlayerAvailability(matchId, playerId);
    } else {
      await setPlayerAvailability(matchId, playerId, status);
    }
    // Guests follow their host off the sheet when the host is no longer IN.
    if (status === "out" || status === "pending") {
      await deleteGuestsForHost(matchId, playerId);
    }
    revalidateAvailability(matchId);
    return {
      ok: true,
      message:
        status === "in"
          ? "Player marked IN."
          : status === "out"
            ? "Player marked OUT."
            : "Player reset to pending.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Admin: open or close availability responses, independent of matchday status. */
export async function setAvailabilityOpenAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const open = String(formData.get("open")) === "true";

    await setAvailabilityOpen(matchId, open);
    revalidateAvailability(matchId);
    return {
      ok: true,
      message: open ? "Availability opened." : "Availability closed.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Admin: configure the maximum number of players that can mark themselves IN. */
export async function setMaxPlayersAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const maxPlayers = maxPlayersSchema.parse(formData.get("maxPlayers"));

    await setMaxPlayers(matchId, maxPlayers);
    revalidateAvailability(matchId);
    return { ok: true, message: `Max players set to ${maxPlayers}.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}
