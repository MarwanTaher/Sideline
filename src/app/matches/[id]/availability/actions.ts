"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  setPlayerAvailability,
  getAvailabilityMatch,
  availabilityOpen,
} from "@/lib/availability";
import { deleteGuestsForHost } from "@/lib/guests";

export interface AvailabilityActionState {
  ok: boolean;
  message: string;
}

const matchIdSchema = z.coerce.number().int().positive();
const statusSchema = z.enum(["in", "out"]);

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

    // Availability is only collected while the matchday is draft/active.
    const match = await getAvailabilityMatch(matchId);
    if (!match) {
      return { ok: false, message: "Match not found." };
    }
    if (!availabilityOpen(match.matchdayStatus)) {
      return { ok: false, message: "Availability is closed for this match." };
    }

    await setPlayerAvailability(matchId, playerId, status);
    if (status === "out") {
      // Guests follow their host — if the host is out, so are their guests.
      await deleteGuestsForHost(matchId, playerId);
    }
    revalidatePath(`/matches/${matchId}/availability`);
    revalidatePath(`/matches/${matchId}/draft`);
    return {
      ok: true,
      message: status === "in" ? "You're marked IN." : "You're marked OUT.",
    };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join(" ")
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    return { ok: false, message };
  }
}
