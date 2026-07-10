"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { addGuest, removeGuest, GuestError, SKILL_LEVELS, countGuests } from "@/lib/guests";
import { getAvailabilityMatch, countInPlayers } from "@/lib/availability";
import { POSITIONS, type Position } from "@/lib/positions";

export interface GuestActionState {
  ok: boolean;
  message: string;
}

const matchIdSchema = z.coerce.number().int().positive();
const guestIdSchema = z.coerce.number().int().positive();
const hostIdSchema = z.coerce.number().int().positive();
const positionSchema = z.enum(POSITIONS as unknown as [Position, ...Position[]]);
const skillSchema = z.enum(
  SKILL_LEVELS.map((s) => s.key) as unknown as [string, ...string[]],
);

function fail(err: unknown): GuestActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  if (err instanceof GuestError) {
    return { ok: false, message: err.message };
  }
  return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
}

function revalidateGuestPaths(matchId: number): void {
  revalidatePath(`/matches/${matchId}/availability`);
  revalidatePath(`/matches/${matchId}/draft`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/payments");
}

export async function addGuestAction(
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  try {
    const session = await auth();
    if (!session?.user) throw new GuestError("Not signed in.");
    const role = session.user.role;
    const isAdmin = role === "admin" || role === "super";

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const name = String(formData.get("name") ?? "");

    const rawPosition = formData.get("position");
    const position = rawPosition ? positionSchema.parse(rawPosition) : null;

    const rawSkill = formData.get("skill");
    const skillKey = rawSkill ? skillSchema.parse(rawSkill) : null;

    // Admins may add on behalf of any player via hostPlayerId; otherwise the
    // signed-in player is the host.
    const rawHost = formData.get("hostPlayerId");
    let hostPlayerId: number;
    if (isAdmin && rawHost) {
      hostPlayerId = hostIdSchema.parse(rawHost);
    } else if (session.user.playerId != null) {
      hostPlayerId = session.user.playerId;
    } else {
      throw new GuestError("Select a host player.");
    }

    // A guest fills a spot too, so a self-service guest cannot push the squad
    // (players IN + guests) past the match cap. Admins bypass this.
    if (!isAdmin) {
      const match = await getAvailabilityMatch(matchId);
      if (match) {
        const [inCount, guestCount] = await Promise.all([
          countInPlayers(matchId),
          countGuests(matchId),
        ]);
        if (inCount + guestCount >= match.maxPlayers) {
          throw new GuestError(
            `Match is full (${match.maxPlayers} players). Ask an admin to add a guest.`,
          );
        }
      }
    }

    await addGuest({ matchId, hostPlayerId, name, position, skillKey });
    revalidateGuestPaths(matchId);
    return { ok: true, message: "Guest added." };
  } catch (err) {
    return fail(err);
  }
}

export async function removeGuestAction(
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  try {
    const session = await auth();
    if (!session?.user) throw new GuestError("Not signed in.");
    const role = session.user.role;
    const isAdmin = role === "admin" || role === "super";

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const guestId = guestIdSchema.parse(formData.get("guestId"));

    // Admins can remove any guest; players only their own.
    const ownerId = isAdmin ? null : session.user.playerId ?? -1;
    await removeGuest(matchId, guestId, ownerId);
    revalidateGuestPaths(matchId);
    return { ok: true, message: "Guest removed." };
  } catch (err) {
    return fail(err);
  }
}
