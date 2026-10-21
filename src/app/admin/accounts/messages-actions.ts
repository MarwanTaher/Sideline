"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { MOMENT_KINDS, type MomentKind } from "@/lib/moment-copy";
import { setMomentCopyForKind } from "@/lib/moment-copy-settings";
import { TAP_SOUND_LIMITS, getTapSounds, setTapSounds, setTapSpamEnabled } from "@/lib/tap-spam-settings";

export type MessagesActionState = { ok: boolean; error?: string };

async function isSuper(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "super";
}

/** Save (or with an empty list, reset) the custom variants for one moment kind. */
export async function saveMomentCopyAction(kind: string, variants: unknown): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  if (!MOMENT_KINDS.includes(kind as MomentKind)) return { ok: false, error: "Unknown message type." };
  try {
    await setMomentCopyForKind(kind as MomentKind, variants);
  } catch {
    return { ok: false, error: "Could not save. Try again." };
  }
  revalidatePath("/admin/accounts");
  return { ok: true };
}

// ── T-1 tap-spam sounds ────────────────────────────────────────────────────

export async function setTapSpamEnabledAction(enabled: boolean): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  await setTapSpamEnabled(enabled);
  revalidatePath("/admin/accounts");
  return { ok: true };
}

export async function uploadTapSoundAction(formData: FormData): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "File storage is not configured." };
  const file = formData.get("sound");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file selected." };
  if (!(TAP_SOUND_LIMITS.types as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Use an MP3, OGG or M4A file." };
  }
  if (file.size > TAP_SOUND_LIMITS.bytes) return { ok: false, error: "Too big (max 200 KB)." };
  const sounds = await getTapSounds();
  if (sounds.length >= TAP_SOUND_LIMITS.count) return { ok: false, error: "Max 3 sounds. Delete one first." };
  try {
    const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "mp3";
    const blob = await put(`tap-sounds/sound.${ext}`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "sound";
    await setTapSounds([...sounds, { url: blob.url, name }]);
  } catch {
    return { ok: false, error: "Upload failed. Try again." };
  }
  revalidatePath("/admin/accounts");
  return { ok: true };
}

export async function deleteTapSoundAction(url: string): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  const sounds = await getTapSounds();
  if (!sounds.some((s) => s.url === url)) return { ok: false, error: "Sound not found." };
  await setTapSounds(sounds.filter((s) => s.url !== url));
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(url).catch(() => {});
  revalidatePath("/admin/accounts");
  return { ok: true };
}
