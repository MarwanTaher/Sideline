"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { sqlClient } from "@/lib/db";
import { FIELD_FEATURE_KEYS, isKitKey, parseTeamColors, type FieldFeature } from "@/lib/field-view";
import { setFieldFeature } from "@/lib/field-view-settings";
import { MAX_TEAMS } from "@/lib/team-constants";

type Result = { ok: boolean; error?: string };

async function isAdmin(): Promise<boolean> {
  const role = (await auth())?.user?.role;
  return role === "admin" || role === "super";
}

/** Set (or clear with null) one team's kit colour for a match. */
export async function setTeamColorAction(matchId: number, teamNo: number, kit: string | null): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Admins only." };
  const mid = Math.trunc(matchId);
  const tn = Math.trunc(teamNo);
  if (!(mid > 0) || !(tn >= 1 && tn <= MAX_TEAMS)) return { ok: false, error: "Invalid team." };
  if (kit !== null && !isKitKey(kit)) return { ok: false, error: "Unknown colour." };

  const rows = (await sqlClient.query(`SELECT team_colors FROM matches WHERE id = $1::int`, [mid])) as Array<{
    team_colors: string | null;
  }>;
  if (rows.length === 0) return { ok: false, error: "Match not found." };
  const colors = parseTeamColors(rows[0].team_colors);
  if (kit === null) delete colors[tn];
  else colors[tn] = kit;
  const json = Object.keys(colors).length ? JSON.stringify(colors) : null;
  await sqlClient.query(`UPDATE matches SET team_colors = $1 WHERE id = $2::int`, [json, mid]);
  revalidatePath(`/matches/${mid}`);
  revalidatePath(`/matches/${mid}/draft`);
  return { ok: true };
}

/** Global on/off switch for one Field view feature. */
export async function setFieldFeatureAction(feature: string, enabled: boolean): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Admins only." };
  if (!(FIELD_FEATURE_KEYS as string[]).includes(feature)) return { ok: false, error: "Unknown feature." };
  await setFieldFeature(feature as FieldFeature, enabled);
  revalidatePath("/matches", "layout");
  return { ok: true };
}
