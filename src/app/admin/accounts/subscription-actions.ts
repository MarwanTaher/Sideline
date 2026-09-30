"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import {
  applySubscribersToMatch,
  applySubscriberToUpcomingMatches,
  subscribePlayer,
  updateSeasonSubscriptionSettings,
  withdrawPlayer,
  getSubscriptionSeason,
} from "@/lib/season-subscriptions";

export type SubscriptionAdminState = { ok: boolean; message: string };

async function requireSuper(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role === "super" ? null : "Not allowed.";
}

function revalidateAll(): void {
  revalidatePath("/admin/accounts");
  revalidatePath("/season");
  revalidatePath("/matches");
}

const settingsSchema = z.object({
  seasonId: z.coerce.number().int().positive(),
  subscriptionEnabled: z.coerce.boolean(),
  subscriberCap: z.coerce.number().int().min(1).max(40),
  terms: z.string().max(20000),
  signupOpen: z.coerce.boolean(),
  bumpTermsVersion: z.coerce.boolean(),
});

export async function saveSubscriptionSettingsAction(
  _prev: SubscriptionAdminState,
  formData: FormData,
): Promise<SubscriptionAdminState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const parsed = settingsSchema.safeParse({
    seasonId: formData.get("seasonId"),
    subscriptionEnabled: formData.get("subscriptionEnabled") === "on",
    subscriberCap: formData.get("subscriberCap"),
    terms: formData.get("terms") ?? "",
    signupOpen: formData.get("signupOpen") === "on",
    bumpTermsVersion: formData.get("bumpTermsVersion") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { seasonId, ...rest } = parsed.data;
  await updateSeasonSubscriptionSettings(seasonId, rest);
  revalidateAll();
  return {
    ok: true,
    message: rest.bumpTermsVersion
      ? "Saved. Terms version bumped — subscribers will see the new rules."
      : "Subscription settings saved.",
  };
}

export async function addSubscriberAction(
  _prev: SubscriptionAdminState,
  formData: FormData,
): Promise<SubscriptionAdminState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const seasonId = Number(formData.get("seasonId"));
  const playerId = Number(formData.get("playerId"));
  if (!Number.isInteger(seasonId) || !Number.isInteger(playerId) || playerId <= 0) {
    return { ok: false, message: "Pick a player." };
  }

  const season = await getSubscriptionSeason(seasonId);
  if (!season) return { ok: false, message: "Season not found." };

  const result = await subscribePlayer(seasonId, playerId, season.termsVersion);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "full"
          ? `The core group is full (${season.subscriberCap}). Raise the cap or remove someone first.`
          : "Subscriptions are not open for this season.",
    };
  }

  revalidateAll();
  return { ok: true, message: "Player added to the core group." };
}

export async function removeSubscriberAction(
  _prev: SubscriptionAdminState,
  formData: FormData,
): Promise<SubscriptionAdminState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const seasonId = Number(formData.get("seasonId"));
  const playerId = Number(formData.get("playerId"));
  if (!Number.isInteger(seasonId) || !Number.isInteger(playerId)) {
    return { ok: false, message: "Invalid request." };
  }

  await withdrawPlayer(seasonId, playerId);
  revalidateAll();
  return {
    ok: true,
    message:
      "Removed from the core group. Their availability on existing matches is unchanged — adjust it per match if needed.",
  };
}

export async function syncSubscribersAction(
  _prev: SubscriptionAdminState,
  formData: FormData,
): Promise<SubscriptionAdminState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const matchId = Number(formData.get("matchId"));
  if (Number.isInteger(matchId) && matchId > 0) {
    const applied = await applySubscribersToMatch(matchId);
    revalidatePath(`/matches/${matchId}/availability`);
    return { ok: true, message: `Marked ${applied} subscriber(s) IN.` };
  }

  const seasonId = Number(formData.get("seasonId"));
  const playerId = Number(formData.get("playerId"));
  if (!Number.isInteger(seasonId) || !Number.isInteger(playerId)) {
    return { ok: false, message: "Invalid request." };
  }
  const applied = await applySubscriberToUpcomingMatches(seasonId, playerId);
  revalidateAll();
  return { ok: true, message: `Marked IN for ${applied} upcoming match(es).` };
}
