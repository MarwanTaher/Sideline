"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { markMomentsSeen } from "@/lib/moments";

const idsSchema = z.array(z.number().int().positive()).max(20);

/** Mark the moments the player just dismissed so they never show again. */
export async function markMomentsSeenAction(ids: number[]): Promise<void> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return;
  await markMomentsSeen(Number(playerId), idsSchema.parse(ids));
}
