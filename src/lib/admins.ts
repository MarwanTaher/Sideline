import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/lib/db";
import type { AdminTabKey } from "@/lib/admin-tabs";

export interface PlayerAdminStatus {
  playerId: number;
  name: string;
  isAdmin: boolean;
  isSuper: boolean;
  /** Active linked admin row id (used for per-admin tab access controls). */
  adminId: number | null;
}

/** Active players with their current admin/super status (for role management). */
export async function getPlayerAdminStatuses(): Promise<PlayerAdminStatus[]> {
  const rows = await db
    .select({
      playerId: schema.players.id,
      name: schema.players.name,
      playerActive: schema.players.active,
      adminId: schema.admins.id,
      adminActive: schema.admins.active,
      isSuper: schema.admins.isSuper,
    })
    .from(schema.players)
    .leftJoin(schema.admins, eq(schema.admins.playerId, schema.players.id))
    .orderBy(asc(schema.players.name));

  const byPlayer = new Map<number, PlayerAdminStatus>();
  for (const r of rows) {
    if (r.playerActive !== 1) continue;
    const cur =
      byPlayer.get(r.playerId) ??
      { playerId: r.playerId, name: r.name, isAdmin: false, isSuper: false, adminId: null };
    if (r.adminActive === 1) {
      cur.isAdmin = true;
      cur.adminId = r.adminId;
      if (r.isSuper === 1) cur.isSuper = true;
    }
    byPlayer.set(r.playerId, cur);
  }
  return [...byPlayer.values()];
}

/**
 * Promote a player to admin. Reactivates an existing linked admin row, or
 * creates one. The admin row's own username/password is never used — the app
 * has a single unified player login and derives the role from this link.
 */
export async function grantPlayerAdmin(playerId: number): Promise<void> {
  const existing = await db
    .select({ id: schema.admins.id })
    .from(schema.admins)
    .where(eq(schema.admins.playerId, playerId))
    .limit(1);
  if (existing[0]) {
    await db
      .update(schema.admins)
      .set({ active: 1 })
      .where(eq(schema.admins.id, existing[0].id));
    return;
  }
  await db.insert(schema.admins).values({
    username: `player-${playerId}-${randomBytes(3).toString("hex")}`,
    passwordSalt: randomBytes(16).toString("hex"),
    passwordHash: randomBytes(32).toString("hex"),
    isSuper: 0,
    active: 1,
    playerId,
  });
}

/** Remove a player's admin access. Super accounts are never touched here. */
export async function revokePlayerAdmin(playerId: number): Promise<void> {
  await db
    .update(schema.admins)
    .set({ active: 0 })
    .where(and(eq(schema.admins.playerId, playerId), eq(schema.admins.isSuper, 0)));
}

/** All tab locks, grouped by admin account id. */
export async function getTabLocksByAdmin(): Promise<Map<number, AdminTabKey[]>> {
  const rows = await db
    .select({
      adminId: schema.adminTabLocks.adminId,
      tabKey: schema.adminTabLocks.tabKey,
    })
    .from(schema.adminTabLocks);

  const map = new Map<number, AdminTabKey[]>();
  for (const r of rows) {
    const list = map.get(r.adminId) ?? [];
    list.push(r.tabKey as AdminTabKey);
    map.set(r.adminId, list);
  }
  return map;
}

/** Lock or unlock a single tab for an admin account. */
export async function setTabLock(
  adminId: number,
  tabKey: AdminTabKey,
  locked: boolean,
): Promise<void> {
  if (locked) {
    await db
      .insert(schema.adminTabLocks)
      .values({ adminId, tabKey })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.adminTabLocks)
      .where(
        and(
          eq(schema.adminTabLocks.adminId, adminId),
          eq(schema.adminTabLocks.tabKey, tabKey),
        ),
      );
  }
}
