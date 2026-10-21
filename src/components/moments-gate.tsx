import { auth } from "@/auth";
import { getUnseenMoments } from "@/lib/moments";
import { getMomentCopy } from "@/lib/moment-copy-settings";
import { MomentsOverlay } from "./moments-overlay";

/** Server half of the moments pop-up: loads unseen moments for the player. */
export async function MomentsGate() {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return null;
  let moments: Awaited<ReturnType<typeof getUnseenMoments>> = [];
  try {
    moments = await getUnseenMoments(Number(playerId));
  } catch {
    return null;
  }
  if (moments.length === 0) return null;
  const overrides = await getMomentCopy().catch(() => ({}));
  return <MomentsOverlay moments={moments} overrides={overrides} name={session?.user?.name ?? undefined} />;
}
