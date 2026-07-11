"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getVotingState,
  submitPlayerVotes,
  votingOpen,
  MIN_RATING,
  MAX_RATING,
} from "@/lib/voting";
import { autoFlagOutliers } from "@/lib/vote-admin";

export interface VoteActionState {
  ok: boolean;
  message: string;
}

const matchIdSchema = z.coerce.number().int().positive();

const payloadSchema = z.object({
  ratings: z.array(
    z.object({
      playerId: z.coerce.number().int().positive(),
      rating: z.coerce.number().int().min(MIN_RATING).max(MAX_RATING),
    }),
  ),
  skippedIds: z.array(z.coerce.number().int().positive()),
});

export async function submitVotesAction(
  _prev: VoteActionState,
  formData: FormData,
): Promise<VoteActionState> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, message: "Sign in to vote." };
    }

    // Self-only: a player votes as themselves. Never trust a client-supplied
    // voter id — always use the authenticated player.
    const voterId = session.user.playerId;
    if (voterId == null) {
      return { ok: false, message: "Only player accounts can vote." };
    }

    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    const { ratings, skippedIds } = payloadSchema.parse(raw);

    // Re-derive authoritative state on the server (gate + roster + prior votes).
    const state = await getVotingState(matchId, voterId);
    if (!state) return { ok: false, message: "Match not found." };
    if (!votingOpen(state.matchdayStatus)) {
      return { ok: false, message: "Voting is not open for this match." };
    }
    if (!state.voterInRoster) {
      return { ok: false, message: "You are not on the roster for this match." };
    }

    // Only players on the ballot (rostered, not the voter) may be rated/skipped.
    const eligible = new Set(state.ballot.map((b) => b.playerId));
    const rated = ratings.filter((r) => eligible.has(r.playerId) && r.playerId !== voterId);
    const skipped = skippedIds.filter((id) => eligible.has(id) && id !== voterId);

    // A player can't be both rated and skipped — rating wins.
    const ratedSet = new Set(rated.map((r) => r.playerId));
    const cleanSkips = skipped.filter((id) => !ratedSet.has(id));

    if (rated.length === 0 && cleanSkips.length === 0) {
      return { ok: false, message: "Nothing to save." };
    }

    await submitPlayerVotes(matchId, voterId, rated, cleanSkips, state.hasVotedBefore);

    // Auto-detect outliers once a bucket has enough votes (>= 4). Runs on the
    // whole match at the default (normal) sensitivity. Best-effort: never let a
    // detection failure block the player's vote from being saved.
    try {
      await autoFlagOutliers(matchId, "normal", "system:auto");
    } catch {
      // ignore — auto-detection is a background convenience
    }

    revalidatePath(`/matches/${matchId}/vote`);
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/leaderboard");
    return {
      ok: true,
      message: `Saved ${rated.length} rating${rated.length === 1 ? "" : "s"}${
        cleanSkips.length ? ` (${cleanSkips.length} skipped)` : ""
      }.`,
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
