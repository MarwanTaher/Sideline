import { auth } from "@/auth";
import { getUnseenMoments } from "@/lib/moments";
import { getMomentCopy } from "@/lib/moment-copy-settings";
import { getMomentSoundConfig, momentSoundUrls } from "@/lib/moment-sound-settings";
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
  const [overrides, sounds] = await Promise.all([
    getMomentCopy().catch(() => ({})),
    // Without the uploads, the built-in recordings still play.
    getMomentSoundConfig()
      .then(momentSoundUrls)
      .catch(() => ({ celebration: [], bummer: [] })),
  ]);
  return (
    <MomentsOverlay
      // A new set of moments (e.g. after a refresh on resume) gets a fresh overlay,
      // even if the previous set was already dismissed.
      key={moments.map((m) => m.id).join(",")}
      moments={moments}
      overrides={overrides}
      customSounds={sounds}
      name={session?.user?.name ?? undefined}
    />
  );
}
