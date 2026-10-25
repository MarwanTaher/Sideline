"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  setPlayerAvailability,
  clearPlayerAvailability,
  getAvailabilityMatch,
  getAvailabilityAllPlayers,
  getPlayerAvailabilityStatus,
  countInPlayers,
  addToWaitlist,
  removeFromWaitlist,
  moveWaitlistPlayer,
  getWaitlist,
  promoteWaitlistCandidate,
} from "@/lib/availability";
import { setAvailabilityOpen, setMaxPlayers } from "@/lib/match-admin";
import { deleteGuestsForHost, countGuests } from "@/lib/guests";
import {
  isWaitlistAutoPromoteEnabled,
  setWaitlistAutoPromote,
  setWaitlistVisibleToPlayers,
  isVoteGateEnabled,
  setVoteGate,
  isAvailabilityLockEnabled,
  setAvailabilityLock,
  getSetting,
  setSetting,
  nudgeKey,
  NUDGE_COOLDOWN_MS,
} from "@/lib/feature-settings";
import { matchLabel } from "@/lib/format";
import { isWithinAvailabilityLock } from "@/lib/match-schedule";
import { getPendingVoteObligation } from "@/lib/voting";
import { notify } from "@/lib/push";
import { addMoments } from "@/lib/moments";

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
  // Home and the match overview also show "You: IN" and the squad count; the
  // fresh payload comes back with the action, so the optimistic button never
  // flickers back while a separate refresh loads.
  revalidatePath("/");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/availability`);
  revalidatePath(`/matches/${matchId}/draft`);
}

/** Admin: manually add a player to the waitlist. */
export async function adminAddToWaitlistAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = matchIdSchema.parse(formData.get("matchId"));
  const playerId = playerIdSchema.parse(formData.get("playerId"));
  await addToWaitlist(matchId, playerId);
  revalidateAvailability(matchId);
}

/** Admin: remove a player from the waitlist. */
export async function adminRemoveFromWaitlistAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = matchIdSchema.parse(formData.get("matchId"));
  const playerId = playerIdSchema.parse(formData.get("playerId"));
  await removeFromWaitlist(matchId, playerId);
  revalidateAvailability(matchId);
}

/** Admin: move a waitlisted player up or down one place. */
export async function adminMoveWaitlistAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = matchIdSchema.parse(formData.get("matchId"));
  const playerId = playerIdSchema.parse(formData.get("playerId"));
  const direction = String(formData.get("direction")) === "up" ? -1 : 1;
  await moveWaitlistPlayer(matchId, playerId, direction);
  revalidateAvailability(matchId);
}

/**
 * Fill any freed spots from the waitlist (first-in fairness), if the admin has
 * enabled auto-promotion. Each promoted player gets a push so they can confirm
 * or drop out again — never a silent add.
 */
async function runWaitlistPromotion(matchId: number): Promise<void> {
  if (!(await isWaitlistAutoPromoteEnabled())) return;
  const match = await getAvailabilityMatch(matchId);
  if (!match || !match.availabilityOpen) return;

  let guard = 0;
  while (guard++ < 50) {
    const list = await getWaitlist(matchId);
    if (list.length === 0) break;

    const [inCount, guestCount] = await Promise.all([
      countInPlayers(matchId),
      countGuests(matchId),
    ]);
    if (inCount + guestCount >= match.maxPlayers) break;

    const nextId = list[0];
    const promoted = await promoteWaitlistCandidate(matchId, nextId);
    await removeFromWaitlist(matchId, nextId);
    if (promoted) {
      try {
        await addMoments([{ playerId: nextId, kind: "waitlist_promoted", matchId, payload: {} }]);
      } catch {
        // Moments are best-effort.
      }
      try {
        await notify(
          "waitlist_promoted",
          {
            title: "A spot opened \u2014 you're in \u26bd",
            body: "A place freed up and you've been moved off the waitlist. Tap to confirm, or set yourself out if you can't make it.",
            url: `/matches/${matchId}/availability`,
            tag: `waitlist-${matchId}-${nextId}`,
          },
          { playerIds: [nextId] },
        );
      } catch {
        // ignore push errors
      }
    }
  }
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

    // 24h lock (admin-toggled): players cannot change their own availability
    // within 24 hours of kickoff. Admins can still change it via the admin
    // controls, which use a separate action.
    if (
      (await isAvailabilityLockEnabled()) &&
      isWithinAvailabilityLock(match.kickoffAt)
    ) {
      return {
        ok: false,
        message:
          "Availability is locked within 24 hours of kickoff. Please contact an admin to change it.",
      };
    }

    // If the player is already IN (e.g. an admin added them to the lineup),
    // marking IN again is a no-op — never waitlist a player who is already in
    // the lineup. Also clear any stray waitlist entry for them.
    if (status === "in") {
      const currentStatus = await getPlayerAvailabilityStatus(matchId, playerId);
      if (currentStatus === "in") {
        await removeFromWaitlist(matchId, playerId);
        revalidateAvailability(matchId);
        return { ok: true, message: "You're already marked IN." };
      }
    }

    // Voting nudge (admin-toggled): a player who was in their last game but
    // hasn't rated anyone yet must vote before they can claim a spot in a new
    // match. Any cast vote clears the block. Only gates marking IN — going OUT
    // is always allowed.
    if (status === "in" && (await isVoteGateEnabled())) {
      const obligation = await getPendingVoteObligation(playerId, matchId);
      if (obligation) {
        return {
          ok: false,
          message:
            `Rate your last game first. Open the Vote tab for match #${obligation.matchId}, ` +
            `submit your ratings, then you can mark yourself IN here.`,
        };
      }
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
        // Match is full. If the admin has enabled auto-promotion, add the
        // player to the waitlist instead of turning them away; otherwise keep
        // the existing "ask an admin" behaviour.
        if (await isWaitlistAutoPromoteEnabled()) {
          const spot = await addToWaitlist(matchId, playerId);
          revalidateAvailability(matchId);
          return {
            ok: true,
            message: `Match is full — you're #${spot} on the waitlist. We'll add you automatically if a spot opens.`,
          };
        }
        return {
          ok: false,
          message: `Match is full (${match.maxPlayers} players). Ask an admin if you need in.`,
        };
      }
    }

    await setPlayerAvailability(matchId, playerId, status);
    if (status === "in") {
      // Now in the lineup — drop from the waitlist if they were queued.
      await removeFromWaitlist(matchId, playerId);
    }
    if (status === "out") {
      // Guests follow their host — if the host is out, so are their guests.
      await deleteGuestsForHost(matchId, playerId);
      // Drop them from the waitlist (if present) and fill the freed spot.
      await removeFromWaitlist(matchId, playerId);
      await runWaitlistPromotion(matchId);
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
    // A player placed IN by an admin joins the lineup — remove any waitlist entry.
    if (status === "in") {
      await removeFromWaitlist(matchId, playerId);
    }
    // Guests follow their host off the sheet when the host is no longer IN.
    if (status === "out" || status === "pending") {
      await deleteGuestsForHost(matchId, playerId);
      await removeFromWaitlist(matchId, playerId);
      await runWaitlistPromotion(matchId);
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

/**
 * Admin: turn waitlist auto-promotion on/off (global). When on, players who try
 * to go IN on a full match are waitlisted and promoted automatically as spots
 * open; also promotes anyone eligible right away.
 */
export async function setWaitlistAutoPromoteAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const enabled = String(formData.get("enabled")) === "true";

    await setWaitlistAutoPromote(enabled);
    if (enabled) {
      // Fill any spots that are already free from the current waitlist.
      await runWaitlistPromotion(matchId);
    }
    revalidateAvailability(matchId);
    return {
      ok: true,
      message: enabled
        ? "Waitlist auto-promotion on."
        : "Waitlist auto-promotion off.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Admin: show or hide the waitlist for non-admin players (global). */
export async function setWaitlistVisibleAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const enabled = String(formData.get("enabled")) === "true";
    await setWaitlistVisibleToPlayers(enabled);
    revalidateAvailability(matchId);
    return {
      ok: true,
      message: enabled
        ? "Waitlist is now visible to players."
        : "Waitlist hidden from players.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Admin: turn the availability vote-gate on/off (global). When on, players who
 * were in their last game but haven't voted are blocked from marking IN for a
 * new match until they rate; casting any vote clears the block.
 */
export async function setVoteGateAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const enabled = String(formData.get("enabled")) === "true";

    await setVoteGate(enabled);
    revalidateAvailability(matchId);
    return {
      ok: true,
      message: enabled ? "Vote-gate on." : "Vote-gate off.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Admin: turn the 24h availability lock on/off (global). When on, players can't
 * change their own availability within 24 hours of kickoff and are told to
 * contact an admin. Admin overrides are always allowed.
 */
export async function setAvailabilityLockAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const enabled = String(formData.get("enabled")) === "true";

    await setAvailabilityLock(enabled);
    revalidateAvailability(matchId);
    return {
      ok: true,
      message: enabled
        ? "Availability locks 24h before kickoff."
        : "24h availability lock off.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/**
 * Admin: push a reminder to every active player who hasn't replied yet.
 * Rate-limited to once per 6 hours per match so players aren't spammed.
 */
export async function nudgePendingAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));

    const last = Number((await getSetting(nudgeKey(matchId))) ?? 0);
    const since = Date.now() - last;
    if (last > 0 && since < NUDGE_COOLDOWN_MS) {
      const hrs = Math.ceil((NUDGE_COOLDOWN_MS - since) / 3_600_000);
      return { ok: false, message: `Already nudged recently. Try again in ~${hrs}h.` };
    }

    const match = await getAvailabilityMatch(matchId);
    if (!match) throw new Error("Match not found.");
    if (!match.availabilityOpen) throw new Error("Sign-up is closed.");

    const pending = (await getAvailabilityAllPlayers(matchId))
      .filter((p) => p.status === "pending")
      .map((p) => p.playerId);
    if (pending.length === 0) return { ok: true, message: "Everyone has replied. 🎉" };

    await setSetting(nudgeKey(matchId), String(Date.now()));
    try {
      await notify(
        "availability_reminder",
        {
          title: "Are you in? ⚽",
          body: `We're picking teams for ${matchLabel(match.playedOn)}. Tap to reply IN or OUT.`,
          url: `/matches/${matchId}/availability`,
          tag: `nudge-${matchId}`,
        },
        { playerIds: pending },
      );
    } catch (err) {
      console.error("nudge push failed", err);
    }
    revalidateAvailability(matchId);
    return { ok: true, message: `Nudged ${pending.length} player${pending.length === 1 ? "" : "s"}.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}