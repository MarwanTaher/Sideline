"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logAppError } from "@/lib/error-log";
import { MOMENT_KINDS, type MomentKind } from "@/lib/moment-copy";
import { setMomentCopyForKind } from "@/lib/moment-copy-settings";
import { TAP_SOUND_LIMITS, getTapSounds, setTapSounds, setTapSpamEnabled } from "@/lib/tap-spam-settings";
import {
  MOMENT_SOUND_LIMITS,
  getMomentSounds,
  isMomentSoundGroup,
  setMomentSounds,
} from "@/lib/moment-sound-settings";

export type MessagesActionState = { ok: boolean; error?: string };

// Messages live in Admin control, which is super-admin only.
async function isSuper(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "super";
}

function revalidateMessages(): void {
  revalidatePath("/admin/accounts");
}

type UploadLimits = { count: number; bytes: number; types: readonly string[] };

function validateSoundFile(file: FormDataEntryValue | null, limits: UploadLimits): File | string {
  if (!(file instanceof File) || file.size === 0) return "No file selected.";
  if (!limits.types.includes(file.type)) return "Use an MP3, OGG, M4A or WAV file.";
  if (file.size > limits.bytes) return `Too big (max ${Math.round(limits.bytes / 1024)} KB).`;
  return file;
}

async function storeSound(folder: string, file: File): Promise<{ url: string; name: string }> {
  const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "mp3";
  const blob = await put(`${folder}/sound.${ext}`, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
  });
  return { url: blob.url, name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "sound" };
}

/** Save (or with an empty list, reset) the custom variants for one moment kind. */
export async function saveMomentCopyAction(kind: string, variants: unknown): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  if (!MOMENT_KINDS.includes(kind as MomentKind)) return { ok: false, error: "Unknown message type." };
  try {
    await setMomentCopyForKind(kind as MomentKind, variants);
  } catch (error) {
    await logAppError(error, "admin.messages.save-copy");
    return { ok: false, error: "Could not save. Try again." };
  }
  revalidateMessages();
  return { ok: true };
}

// ── Celebration / bummer sounds ────────────────────────────────────────────

export async function uploadMomentSoundAction(formData: FormData): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "File storage is not configured." };
  const group = formData.get("group");
  if (!isMomentSoundGroup(group)) return { ok: false, error: "Unknown sound type." };
  const file = validateSoundFile(formData.get("sound"), MOMENT_SOUND_LIMITS);
  if (typeof file === "string") return { ok: false, error: file };
  const sounds = await getMomentSounds(group);
  if (sounds.length >= MOMENT_SOUND_LIMITS.count) return { ok: false, error: "Max 3 sounds. Delete one first." };
  try {
    await setMomentSounds(group, [...sounds, await storeSound(`moment-sounds/${group}`, file)]);
  } catch (error) {
    await logAppError(error, "admin.messages.upload-moment-sound");
    return { ok: false, error: "Upload failed. Try again." };
  }
  revalidateMessages();
  return { ok: true };
}

export async function deleteMomentSoundAction(group: string, url: string): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  if (!isMomentSoundGroup(group)) return { ok: false, error: "Unknown sound type." };
  const sounds = await getMomentSounds(group);
  if (!sounds.some((s) => s.url === url)) return { ok: false, error: "Sound not found." };
  await setMomentSounds(group, sounds.filter((s) => s.url !== url));
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await del(url).catch((error: unknown) => logAppError(error, "admin.messages.delete-moment-sound"));
  }
  revalidateMessages();
  return { ok: true };
}

// ── T-1 tap-spam sounds ────────────────────────────────────────────────────

export async function setTapSpamEnabledAction(enabled: boolean): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  await setTapSpamEnabled(enabled);
  revalidateMessages();
  return { ok: true };
}

export async function uploadTapSoundAction(formData: FormData): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "File storage is not configured." };
  const file = validateSoundFile(formData.get("sound"), TAP_SOUND_LIMITS);
  if (typeof file === "string") return { ok: false, error: file };
  const sounds = await getTapSounds();
  if (sounds.length >= TAP_SOUND_LIMITS.count) return { ok: false, error: "Max 3 sounds. Delete one first." };
  try {
    await setTapSounds([...sounds, await storeSound("tap-sounds", file)]);
  } catch (error) {
    await logAppError(error, "admin.messages.upload-sound");
    return { ok: false, error: "Upload failed. Try again." };
  }
  revalidateMessages();
  return { ok: true };
}

export async function deleteTapSoundAction(url: string): Promise<MessagesActionState> {
  if (!(await isSuper())) return { ok: false, error: "Not allowed." };
  const sounds = await getTapSounds();
  if (!sounds.some((s) => s.url === url)) return { ok: false, error: "Sound not found." };
  await setTapSounds(sounds.filter((s) => s.url !== url));
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(url).catch(() => {});
  revalidateMessages();
  return { ok: true };
}
