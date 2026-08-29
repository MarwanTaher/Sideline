import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/lib/db";
import type { AdminTabKey } from "@/lib/admin-tabs";

export interface AdminAccountRow {
  id: number;
  username: string;
  isSuper: boolean;
  active: boolean;
  playerId: number | null;
  playerName: string | null;
}

export interface LinkablePlayer {
  id: number;
  name: string;
  active: boolean;
}

/** All admin accounts with the player they are linked to (if any). */
export async function getAdminAccounts(): Promise<AdminAccountRow[]> {
  const rows = await db
    .select({
      id: schema.admins.id,
      username: schema.admins.username,
      isSuper: schema.admins.isSuper,
      active: schema.admins.active,
      playerId: schema.admins.playerId,
      playerName: schema.players.name,
    })
    .from(schema.admins)
    .leftJoin(schema.players, eq(schema.players.id, schema.admins.playerId))
    .orderBy(asc(schema.admins.username));

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    isSuper: r.isSuper === 1,
    active: r.active === 1,
    playerId: r.playerId ?? null,
    playerName: r.playerName ?? null,
  }));
}

/** Players available to link an admin account to (all players, name-sorted). */
export async function getLinkablePlayers(): Promise<LinkablePlayer[]> {
  const rows = await db
    .select({
      id: schema.players.id,
      name: schema.players.name,
      active: schema.players.active,
    })
    .from(schema.players)
    .orderBy(asc(schema.players.name));

  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active === 1 }));
}

/** Link (or, with null, unlink) an admin account to a player. */
export async function setAdminPlayerLink(
  adminId: number,
  playerId: number | null,
): Promise<void> {
  await db
    .update(schema.admins)
    .set({ playerId })
    .where(eq(schema.admins.id, adminId));
}

export interface PlayerAdminStatus {
  playerId: number;
  name: string;
  isAdmin: boolean;
  isSuper: boolean;
}

/** Active players with their current admin/super status (for role management). */
export async function getPlayerAdminStatuses(): Promise<PlayerAdminStatus[]> {
  const rows = await db
    .select({
      playerId: schema.players.id,
      name: schema.players.name,
      playerActive: schema.players.active,
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
      { playerId: r.playerId, name: r.name, isAdmin: false, isSuper: false };
    if (r.adminActive === 1) {
      cur.isAdmin = true;
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
