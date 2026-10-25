import "server-only";
import { getSetting, setSetting } from "./feature-settings";

const ENABLED_KEY = "tap_spam_enabled";
const SOUNDS_KEY = "tap_spam_sounds";

export const TAP_SOUND_LIMITS = {
  count: 3,
  bytes: 200 * 1024,
  types: ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav"],
} as const;

export type TapSound = { url: string; name: string };
export type TapSpamConfig = { enabled: boolean; sounds: TapSound[] };

/** On unless an admin switched it off. */
export async function isTapSpamEnabled(): Promise<boolean> {
  return (await getSetting(ENABLED_KEY)) !== "0";
}

export async function setTapSpamEnabled(enabled: boolean): Promise<void> {
  await setSetting(ENABLED_KEY, enabled ? "1" : "0");
}

export async function getTapSounds(): Promise<TapSound[]> {
  const raw = await getSetting(SOUNDS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((s): s is TapSound => !!s && typeof s.url === "string" && s.url.startsWith("https://"))
      .map((s) => ({ url: s.url, name: typeof s.name === "string" ? s.name : "sound" }))
      .slice(0, TAP_SOUND_LIMITS.count);
  } catch {
    return [];
  }
}

export async function setTapSounds(sounds: TapSound[]): Promise<void> {
  await setSetting(SOUNDS_KEY, JSON.stringify(sounds.slice(0, TAP_SOUND_LIMITS.count)));
}

export async function getTapSpamConfig(): Promise<TapSpamConfig> {
  const [enabled, sounds] = await Promise.all([isTapSpamEnabled(), getTapSounds()]);
  return { enabled, sounds };
}
