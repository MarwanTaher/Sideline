"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addGuest,
  removeGuest,
  approveGuest,
  getGuest,
  GuestError,
  SKILL_LEVELS,
} from "@/lib/guests";
import { notify } from "@/lib/push";
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
  revalidatePath(`/matches/${matchId}/payments`);
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
    // signed-in player is the host requesting the guest.
    const rawHost = formData.get("hostPlayerId");
    let hostPlayerId: number;
    if (isAdmin && rawHost) {
      hostPlayerId = hostIdSchema.parse(rawHost);
    } else if (session.user.playerId != null) {
      hostPlayerId = session.user.playerId;
    } else {
      throw new GuestError("Select a host player.");
    }

    // Admin adds are auto-approved and count immediately; player submissions are
    // pending until an admin approves them, so they do not reserve a spot and
    // are not subject to the full-match check here.
    const status = isAdmin ? "approved" : "pending";

    await addGuest({ matchId, hostPlayerId, name, position, skillKey, status });
    revalidateGuestPaths(matchId);

    if (status === "pending") {
      const cleanName = name.trim() || "a guest";
      const hostName = session.user.name || "A player";
      try {
        await notify("guest_request", {
          title: "Guest request \u{1f91d}",
          body: `${hostName} wants to bring ${cleanName} \u2014 approve or decline.`,
          url: `/matches/${matchId}/availability`,
          tag: `match-${matchId}-guest-request`,
        });
      } catch {
        // ignore push errors
      }
      return { ok: true, message: "Guest request submitted for admin approval." };
    }

    return { ok: true, message: "Guest added." };
  } catch (err) {
    return fail(err);
  }
}

export async function approveGuestAction(
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  try {
    const session = await auth();
    if (!session?.user) throw new GuestError("Not signed in.");
    const role = session.user.role;
    const isAdmin = role === "admin" || role === "super";
    if (!isAdmin) throw new GuestError("Only admins can approve guests.");

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const guestId = guestIdSchema.parse(formData.get("guestId"));

    const guest = await getGuest(matchId, guestId);
    if (!guest) throw new GuestError("Guest request not found.");

    await approveGuest(matchId, guestId);
    revalidateGuestPaths(matchId);

    try {
      await notify(
        "guest_decision",
        {
          title: "Guest approved \u2705",
          body: `Your guest ${guest.name} has been approved for the match.`,
          url: `/matches/${matchId}/availability`,
          tag: `match-${matchId}-guest-${guestId}-decision`,
        },
        { playerIds: [guest.hostPlayerId] },
      );
    } catch {
      // ignore push errors
    }

    return { ok: true, message: "Guest approved." };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectGuestAction(
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  try {
    const session = await auth();
    if (!session?.user) throw new GuestError("Not signed in.");
    const role = session.user.role;
    const isAdmin = role === "admin" || role === "super";
    if (!isAdmin) throw new GuestError("Only admins can decline guests.");

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const guestId = guestIdSchema.parse(formData.get("guestId"));

    const guest = await getGuest(matchId, guestId);
    if (!guest) throw new GuestError("Guest request not found.");

    // Admins may remove any guest, so pass a null owner.
    await removeGuest(matchId, guestId, null);
    revalidateGuestPaths(matchId);

    try {
      await notify(
        "guest_decision",
        {
          title: "Guest declined",
          body: `Your guest request for ${guest.name} was declined.`,
          url: `/matches/${matchId}/availability`,
          tag: `match-${matchId}-guest-${guestId}-decision`,
        },
        { playerIds: [guest.hostPlayerId] },
      );
    } catch {
      // ignore push errors
    }

    return { ok: true, message: "Guest request declined." };
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
