"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";

/**
 * Toggle the cosmetic "acting as" view for admins who also play.
 * Purely UI: hides/shows admin chrome. Permissions are unaffected.
 */
export async function setViewModeAction(formData: FormData): Promise<void> {
  const mode = formData.get("mode") === "player" ? "player" : "admin";
  const store = await cookies();
  store.set(VIEW_MODE_COOKIE, mode, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
