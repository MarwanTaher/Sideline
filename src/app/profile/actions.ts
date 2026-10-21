"use server";

import { z } from "zod";
import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { changePlayerPassword } from "@/lib/password-reset";
import {
  updatePlayerContact,
  updatePlayerPhoto,
  getPlayerContact,
} from "@/lib/player-profile";
import { setFunMessages } from "@/lib/moments";

export interface ChangePasswordState {
  ok: boolean;
  message: string;
}

const schema = z
  .object({
    current: z.string(),
    password: z.string().min(8, "New password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "New passwords do not match.",
    path: ["confirm"],
  });

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) {
    return { ok: false, message: "You must be signed in as a player." };
  }

  try {
    const parsed = schema.parse({
      current: formData.get("current") ?? "",
      password: formData.get("password") ?? "",
      confirm: formData.get("confirm") ?? "",
    });
    // playerId comes from the session, never from the form.
    return await changePlayerPassword(Number(playerId), parsed.current, parsed.password);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: "Could not update your password." };
  }
}

// ---------------------------------------------------------------------------
// Contact details (email + phone)
// ---------------------------------------------------------------------------

export interface ContactState {
  ok: boolean;
  message: string;
}

const contactSchema = z.object({
  email: z
    .string()
    .trim()
    .max(255)
    .email("Enter a valid email address.")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9+()\-\s]*$/, "Phone can only contain digits and + ( ) - spaces.")
    .transform((v) => (v === "" ? null : v)),
});

export async function updateContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) {
    return { ok: false, message: "You must be signed in as a player." };
  }
  try {
    const parsed = contactSchema.parse({
      email: formData.get("email") ?? "",
      phone: formData.get("phone") ?? "",
    });
    await updatePlayerContact(Number(playerId), parsed.email, parsed.phone);
    revalidatePath("/profile");
    return { ok: true, message: "Contact details saved." };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: "Could not save your contact details." };
  }
}

// ---------------------------------------------------------------------------
// Profile photo (Vercel Blob)
// ---------------------------------------------------------------------------

export interface PhotoState {
  ok: boolean;
  message: string;
  url?: string | null;
}

const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB (client already downscales)
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadPhotoAction(formData: FormData): Promise<PhotoState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) {
    return { ok: false, message: "You must be signed in as a player." };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      message: "Photo uploads are not configured (missing blob storage token).",
    };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No image selected." };
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return { ok: false, message: "Use a JPEG, PNG or WebP image." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: "Image is too large (max 3 MB)." };
  }

  const pid = Number(playerId);
  try {
    // Remove the previous photo so blobs don't accumulate.
    const existing = await getPlayerContact(pid);
    const blob = await put(`players/${pid}.jpg`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    await updatePlayerPhoto(pid, blob.url);
    if (existing?.photoUrl) {
      await del(existing.photoUrl).catch(() => {});
    }
    revalidatePath("/profile");
    return { ok: true, message: "Photo updated.", url: blob.url };
  } catch {
    return { ok: false, message: "Could not upload the photo." };
  }
}

export async function removePhotoAction(): Promise<PhotoState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) {
    return { ok: false, message: "You must be signed in as a player." };
  }
  const pid = Number(playerId);
  try {
    const existing = await getPlayerContact(pid);
    await updatePlayerPhoto(pid, null);
    if (existing?.photoUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(existing.photoUrl).catch(() => {});
    }
    revalidatePath("/profile");
    return { ok: true, message: "Photo removed.", url: null };
  } catch {
    return { ok: false, message: "Could not remove the photo." };
  }
}

/** Toggle the light-hearted "bummer" messages after a rough game. */
export async function setFunMessagesAction(enabled: boolean): Promise<{ ok: boolean }> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return { ok: false };
  await setFunMessages(Number(playerId), z.boolean().parse(enabled));
  revalidatePath("/profile");
  return { ok: true };
}
