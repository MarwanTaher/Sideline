"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createSeason,
  deleteSeason,
  setSeasonStatus,
  updateSeason,
} from "@/lib/seasons";

export type SeasonActionState = { ok: boolean; message: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const seasonSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  startDate: z.string().regex(DATE, "Start date must be YYYY-MM-DD"),
  endDate: z
    .string()
    .trim()
    .refine((v) => v === "" || DATE.test(v), "End date must be YYYY-MM-DD"),
});

async function requireSuper(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role === "super" ? null : "Not allowed.";
}

export async function saveSeasonAction(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const parsed = seasonSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { id, name, startDate, endDate } = parsed.data;
  if (endDate && endDate < startDate) {
    return { ok: false, message: "End date cannot be before the start date." };
  }

  if (id) await updateSeason(id, name, startDate, endDate || null);
  else await createSeason(name, startDate, endDate || null);

  revalidatePath("/admin/accounts");
  revalidatePath("/leaderboard");
  return { ok: true, message: id ? "Season updated." : "Season created." };
}

export async function setSeasonStatusAction(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Invalid season." };
  const archived = formData.get("archived") === "true";

  await setSeasonStatus(id, archived ? "archived" : "active");
  revalidatePath("/admin/accounts");
  revalidatePath("/leaderboard");
  return { ok: true, message: archived ? "Season archived." : "Season reopened." };
}

export async function deleteSeasonAction(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Invalid season." };

  // Matches are matched to a season by date, so deleting one loses no history.
  await deleteSeason(id);
  revalidatePath("/admin/accounts");
  revalidatePath("/leaderboard");
  return { ok: true, message: "Season deleted." };
}
