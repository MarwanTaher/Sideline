"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setTabLock, grantPlayerAdmin, revokePlayerAdmin } from "@/lib/admins";
import { ADMIN_TAB_KEYS, type AdminTabKey } from "@/lib/admin-tabs";

export interface AccountActionState {
  ok: boolean;
  message: string;
}

async function requireSuper(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "super") {
    throw new Error("Only a super admin can manage admin access.");
  }
}

function fail(err: unknown): AccountActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  return {
    ok: false,
    message: err instanceof Error ? err.message : "Something went wrong.",
  };
}

const tabLockSchema = z.object({
  adminId: z.coerce.number().int().positive(),
  tabKey: z.enum(ADMIN_TAB_KEYS as unknown as [string, ...string[]]),
  locked: z
    .union([z.literal("1"), z.literal("0")])
    .transform((v) => v === "1"),
});

export async function setTabLockAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await requireSuper();
    const { adminId, tabKey, locked } = tabLockSchema.parse({
      adminId: formData.get("adminId"),
      tabKey: formData.get("tabKey"),
      locked: formData.get("locked"),
    });
    await setTabLock(adminId, tabKey as AdminTabKey, locked);
    revalidatePath("/admin/accounts");
    return {
      ok: true,
      message: locked ? "Tab locked." : "Tab unlocked.",
    };
  } catch (err) {
    return fail(err);
  }
}

const playerSchema = z.object({ playerId: z.coerce.number().int().positive() });

export async function grantAdminAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await requireSuper();
    const { playerId } = playerSchema.parse({ playerId: formData.get("playerId") });
    await grantPlayerAdmin(playerId);
    revalidatePath("/admin/accounts");
    return { ok: true, message: "Player is now an admin." };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeAdminAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await requireSuper();
    const { playerId } = playerSchema.parse({ playerId: formData.get("playerId") });
    await revokePlayerAdmin(playerId);
    revalidatePath("/admin/accounts");
    return { ok: true, message: "Admin access removed." };
  } catch (err) {
    return fail(err);
  }
}
