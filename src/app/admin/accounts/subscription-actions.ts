"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { logAppError } from "@/lib/error-log";
import {
  applySubscribersToMatch,
  applySubscriberToUpcomingMatches,
  offerNextSeasonWaitlistPlayer,
  removeSeasonWaitlistPlayer,
  subscribePlayer,
  updateSeasonSubscriptionSettings,
  withdrawPlayer,
  getSubscriptionSeason,
} from "@/lib/season-subscriptions";
import {
  getSeasonGoLiveChecklist,
  setSeasonGoLiveCheck,
  type SeasonGoLiveCheckKey,
} from "@/lib/season-billing";

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
  visibleToPlayers: z.coerce.boolean(),
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
    visibleToPlayers: formData.get("visibleToPlayers") === "on",
    bumpTermsVersion: formData.get("bumpTermsVersion") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { seasonId, ...rest } = parsed.data;
  const current = await getSubscriptionSeason(seasonId);
  if (rest.visibleToPlayers && current && !current.visibleToPlayers) {
    if (rest.terms !== current.terms) {
      return { ok: false, message: "Save the new terms while hidden, then confirm them before releasing the season." };
    }
    const checklist = await getSeasonGoLiveChecklist(seasonId);
    if (!checklist?.complete) {
      return {
        ok: false,
        message: "Complete every go-live checklist item before releasing the season.",
      };
    }
  }
  try {
    await updateSeasonSubscriptionSettings(seasonId, rest);
  } catch (error) {
    await logAppError(error, "season.subscription-settings");
    return { ok: false, message: error instanceof Error ? error.message : "Could not save season settings." };
  }
  revalidateAll();
  return {
    ok: true,
    message: rest.bumpTermsVersion
      ? "Saved. Terms version bumped — subscribers will see the new rules."
      : rest.visibleToPlayers
        ? "Saved. The season is visible to players."
        : "Saved. The season stays hidden from players.",
  };
}

export async function setSeasonGoLiveCheckAction(
  _prev: SubscriptionAdminState,
  formData: FormData,
): Promise<SubscriptionAdminState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const seasonId = Number(formData.get("seasonId"));
  const check = String(formData.get("check")) as SeasonGoLiveCheckKey;
  const checked = formData.get("checked") === "true";
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    return { ok: false, message: "Invalid season." };
  }
  if (
    !["ratesConfirmed", "termsFinal", "testInvoiceCompleted", "reminderTextReviewed"].includes(
      check,
    )
  ) {
    return { ok: false, message: "Invalid checklist item." };
  }

  try {
    await setSeasonGoLiveCheck(seasonId, check, checked);
  } catch (err) {
    await logAppError(err, "season.go_live_check");
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not update the checklist.",
    };
  }
  revalidatePath("/admin/accounts");
  return { ok: true, message: checked ? "Checklist updated." : "Confirmation cleared." };
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

export async function removeSeasonWaitlistPlayerAction(
  _prev: SubscriptionAdminState,
  formData: FormData,
): Promise<SubscriptionAdminState> {
  const denied = await requireSuper();
  if (denied) return { ok: false, message: denied };

  const seasonId = Number(formData.get("seasonId"));
  const playerId = Number(formData.get("playerId"));
  if (!Number.isInteger(seasonId) || seasonId <= 0 || !Number.isInteger(playerId) || playerId <= 0) {
    return { ok: false, message: "Invalid request." };
  }

  await removeSeasonWaitlistPlayer(seasonId, playerId);
  await offerNextSeasonWaitlistPlayer(seasonId);
  revalidateAll();
  return { ok: true, message: "Removed from the reserve list." };
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
