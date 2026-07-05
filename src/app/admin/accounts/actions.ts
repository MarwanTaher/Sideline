"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setAdminPlayerLink } from "@/lib/admins";

export interface AccountActionState {
  ok: boolean;
  message: string;
}

async function requireSuper(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "super") {
    throw new Error("Only a super admin can manage account links.");
  }
}

const linkSchema = z.object({
  adminId: z.coerce.number().int().positive(),
  playerId: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .transform((v) => (v === "" ? null : v)),
});

function fail(err: unknown): AccountActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  return {
    ok: false,
    message: err instanceof Error ? err.message : "Something went wrong.",
  };
}

export async function linkAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await requireSuper();
    const { adminId, playerId } = linkSchema.parse({
      adminId: formData.get("adminId"),
      playerId: formData.get("playerId") ?? "",
    });
    await setAdminPlayerLink(adminId, playerId);
    revalidatePath("/admin/accounts");
    return {
      ok: true,
      message: playerId ? "Account linked to player." : "Account unlinked.",
    };
  } catch (err) {
    return fail(err);
  }
}
