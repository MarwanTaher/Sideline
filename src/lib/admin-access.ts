import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import type { AdminTabKey } from "@/lib/admin-tabs";

/**
 * Locked admin tabs for the admin account linked to a given player. Super
 * admins are never locked (they always get an empty set). Returns the raw
 * tab keys stored in `admin_tab_locks`.
 */
export async function getLockedTabsForPlayer(
  playerId: number,
): Promise<AdminTabKey[]> {
  const rows = await db
    .select({ tabKey: schema.adminTabLocks.tabKey })
    .from(schema.adminTabLocks)
    .innerJoin(
      schema.admins,
      eq(schema.admins.id, schema.adminTabLocks.adminId),
    )
    .where(
      and(
        eq(schema.admins.playerId, playerId),
        eq(schema.admins.active, 1),
        eq(schema.admins.isSuper, 0),
      ),
    );
  return rows.map((r) => r.tabKey as AdminTabKey);
}

/** Whether a specific tab is locked for the admin linked to `playerId`. */
export async function isTabLockedForPlayer(
  playerId: number,
  tabKey: AdminTabKey,
): Promise<boolean> {
  const locked = await getLockedTabsForPlayer(playerId);
  return locked.includes(tabKey);
}

/**
 * Whether the tab is locked for the currently signed-in user. Super admins
 * are never locked; users without a linked player id are never locked.
 * This is the server-side enforcement used by admin pages.
 */
export async function isTabLockedForCurrentUser(
  tabKey: AdminTabKey,
): Promise<boolean> {
  const session = await auth();
  const role = session?.user?.role;
  if (role === "super") return false;
  const playerId = session?.user?.playerId;
  if (playerId == null) return false;
  return isTabLockedForPlayer(playerId, tabKey);
}
