import { cookies } from "next/headers";

export type ViewMode = "player" | "admin";

export const VIEW_MODE_COOKIE = "fb_view";

/**
 * Cosmetic view preference for admins who also play. Defaults to "admin".
 * This NEVER grants or removes permissions — server actions/pages still
 * enforce access with their own role checks.
 */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  return store.get(VIEW_MODE_COOKIE)?.value === "player" ? "player" : "admin";
}

/**
 * Effective admin state for rendering. An admin who has toggled to the
 * "player" view is treated as a player for all UI/content decisions, so the
 * whole dashboard reflects the player-only experience. Non-admins are never
 * elevated. Server actions still enforce the real role independently.
 */
export async function isAdminView(realIsAdmin: boolean): Promise<boolean> {
  if (!realIsAdmin) return false;
  return (await getViewMode()) === "admin";
}
