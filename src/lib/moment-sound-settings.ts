import "server-only";
import { getSetting, setSetting } from "./feature-settings";
import type { MomentSoundGroup, MomentSoundUrls } from "./silly-sounds";

export const MOMENT_SOUND_GROUPS = ["celebration", "bummer"] as const satisfies readonly MomentSoundGroup[];

export const MOMENT_SOUND_LIMITS = {
  count: 3,
  bytes: 1024 * 1024,
  types: ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav"],
} as const;

export type MomentSound = { url: string; name: string };
export type MomentSoundConfig = Record<MomentSoundGroup, MomentSound[]>;

const key = (group: MomentSoundGroup) => `moment_sounds_${group}`;

export function isMomentSoundGroup(value: unknown): value is MomentSoundGroup {
  return (MOMENT_SOUND_GROUPS as readonly unknown[]).includes(value);
}

export async function getMomentSounds(group: MomentSoundGroup): Promise<MomentSound[]> {
  const raw = await getSetting(key(group));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((s): s is MomentSound => !!s && typeof s.url === "string" && s.url.startsWith("https://"))
      .map((s) => ({ url: s.url, name: typeof s.name === "string" ? s.name : "sound" }))
      .slice(0, MOMENT_SOUND_LIMITS.count);
  } catch {
    return [];
  }
}

export async function setMomentSounds(group: MomentSoundGroup, sounds: MomentSound[]): Promise<void> {
  await setSetting(key(group), JSON.stringify(sounds.slice(0, MOMENT_SOUND_LIMITS.count)));
}

export async function getMomentSoundConfig(): Promise<MomentSoundConfig> {
  const [celebration, bummer] = await Promise.all([getMomentSounds("celebration"), getMomentSounds("bummer")]);
  return { celebration, bummer };
}

/** Just the URLs, for the client-side player. */
export function momentSoundUrls(config: MomentSoundConfig): MomentSoundUrls {
  return {
    celebration: config.celebration.map((s) => s.url),
    bummer: config.bummer.map((s) => s.url),
  };
}
