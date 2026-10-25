"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { toggleReaction } from "@/lib/reactions";
import { castMotmVote } from "@/lib/motm";

export interface SocialActionState {
  ok: boolean;
  message: string;
}

const matchIdSchema = z.coerce.number().int().positive();

export async function reactAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return { ok: false, message: "Only players can react." };

  const matchId = matchIdSchema.parse(formData.get("matchId"));
  const emoji = String(formData.get("emoji") ?? "");
  const result = await toggleReaction(matchId, playerId, emoji);
  if (result === null) return { ok: false, message: "You can only react to matches you played in." };
  revalidatePath(`/matches/${matchId}`);
  return { ok: true, message: "" };
}

export async function castMotmAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return { ok: false, message: "Only players can vote." };

  const matchId = matchIdSchema.parse(formData.get("matchId"));
  const votedForId = z.coerce.number().int().positive().parse(formData.get("votedForId"));
  const ok = await castMotmVote(matchId, playerId, votedForId);
  if (!ok) return { ok: false, message: "You can only vote for a teammate you played with." };
  revalidatePath(`/matches/${matchId}`);
  return { ok: true, message: "MOTM vote recorded." };
}
