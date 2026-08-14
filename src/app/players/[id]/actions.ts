"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { toggleKudos } from "@/lib/kudos";

export type KudosActionState = {
  ok: boolean;
  given?: boolean;
  error?: string;
};

export async function toggleKudosAction(
  _prev: KudosActionState,
  formData: FormData,
): Promise<KudosActionState> {
  const session = await auth();
  const viewerId = session?.user?.playerId;
  if (viewerId == null) {
    return { ok: false, error: "You must be signed in as a player." };
  }

  const targetId = Number(formData.get("targetId"));
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return { ok: false, error: "Invalid player." };
  }
  if (Number(viewerId) === targetId) {
    return { ok: false, error: "You cannot give kudos to yourself." };
  }

  try {
    const { given } = await toggleKudos(Number(viewerId), targetId);
    revalidatePath(`/players/${targetId}`);
    return { ok: true, given };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update kudos.",
    };
  }
}
