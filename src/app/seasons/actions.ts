"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createSeason, archiveSeason } from "@/lib/seasons";

export interface SeasonActionState {
  ok: boolean;
  message: string;
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") throw new Error("Not authorized");
}

function fail(err: unknown): SeasonActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
  }
  return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export async function createSeasonAction(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  try {
    await requireAdmin();
    const name = z.string().trim().min(1, "Season name is required.").parse(formData.get("name"));
    const startDate = dateSchema.parse(formData.get("startDate"));
    const resetMode = z.enum(["soft", "hard"]).parse(formData.get("resetMode"));
    await createSeason({ name, startDate, resetMode });
    revalidatePath("/seasons");
    return { ok: true, message: "Season started." };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveSeasonAction(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  try {
    await requireAdmin();
    const id = z.coerce.number().int().positive().parse(formData.get("seasonId"));
    const endDate = dateSchema.parse(formData.get("endDate"));
    await archiveSeason(id, endDate);
    revalidatePath("/seasons");
    return { ok: true, message: "Season archived." };
  } catch (err) {
    return fail(err);
  }
}
