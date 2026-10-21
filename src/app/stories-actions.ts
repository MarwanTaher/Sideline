"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  STORY_LIMITS,
  STORY_REACTIONS,
  countLiveStories,
  createStory,
  deleteStory,
  getStoryOwner,
  getStoryViewers,
  markStoryViewed,
  setStoryReaction,
  type StoryViewer,
} from "@/lib/stories";

type Result = { ok: boolean; error?: string };

const IMAGE_TYPES = ["image/jpeg", "image/webp", "image/png"];

async function me(): Promise<{ playerId: number; isAdmin: boolean } | null> {
  const session = await auth();
  const pid = session?.user?.playerId;
  if (pid == null) return null;
  const role = session?.user?.role;
  return { playerId: Number(pid), isAdmin: role === "admin" || role === "super" };
}

export async function postStoryAction(formData: FormData): Promise<Result> {
  const user = await me();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "Photo uploads are not configured." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No photo selected." };
  if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Use a JPEG, WebP or PNG photo." };
  if (file.size > STORY_LIMITS.bytes) return { ok: false, error: "Photo is too large (max 1 MB)." };

  const caption = String(formData.get("caption") ?? "").trim().slice(0, STORY_LIMITS.caption) || null;
  const rawMatch = Number(formData.get("matchId"));
  const matchId = Number.isInteger(rawMatch) && rawMatch > 0 ? rawMatch : null;

  if ((await countLiveStories(user.playerId)) >= STORY_LIMITS.live) {
    return { ok: false, error: `You already have ${STORY_LIMITS.live} live stories. Delete one or wait for one to expire.` };
  }

  try {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const blob = await put(`stories/${user.playerId}/story.${ext}`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    try {
      await createStory(user.playerId, blob.url, caption, matchId);
    } catch (e) {
      await del(blob.url).catch(() => {});
      throw e;
    }
  } catch {
    return { ok: false, error: "Could not post the story. Try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function markStoryViewedAction(storyId: number): Promise<void> {
  const user = await me();
  if (!user || !Number.isInteger(storyId)) return;
  await markStoryViewed(storyId, user.playerId).catch(() => {});
}

export async function reactToStoryAction(storyId: number, emoji: string | null): Promise<Result> {
  const user = await me();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!Number.isInteger(storyId)) return { ok: false, error: "Unknown story." };
  if (emoji != null && !(STORY_REACTIONS as readonly string[]).includes(emoji)) return { ok: false, error: "Unknown reaction." };
  try {
    await setStoryReaction(storyId, user.playerId, emoji);
  } catch {
    return { ok: false, error: "Could not react." };
  }
  return { ok: true };
}

/** Owner only: who saw the story and how they reacted. */
export async function getStoryViewersAction(storyId: number): Promise<StoryViewer[] | null> {
  const user = await me();
  if (!user || !Number.isInteger(storyId)) return null;
  const owner = await getStoryOwner(storyId);
  if (!owner || owner.playerId !== user.playerId) return null;
  return getStoryViewers(storyId);
}

/** Owner or any admin. */
export async function deleteStoryAction(storyId: number): Promise<Result> {
  const user = await me();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!Number.isInteger(storyId)) return { ok: false, error: "Unknown story." };
  const owner = await getStoryOwner(storyId);
  if (!owner) return { ok: true };
  if (owner.playerId !== user.playerId && !user.isAdmin) return { ok: false, error: "Not allowed." };
  await deleteStory(storyId);
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(owner.imageUrl).catch(() => {});
  revalidatePath("/");
  return { ok: true };
}
