"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getSubscriptionSeason,
  subscribePlayer,
  withdrawPlayer,
} from "@/lib/season-subscriptions";

export type SubscriptionActionState = { ok: boolean; message: string };

function revalidateAll(): void {
  revalidatePath("/season");
  revalidatePath("/matches");
  revalidatePath("/");
}

export async function acceptTermsAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) {
    return { ok: false, message: "Only player accounts can subscribe." };
  }

  if (formData.get("agree") !== "on") {
    return { ok: false, message: "You need to accept the rules to take a place." };
  }

  const seasonId = Number(formData.get("seasonId"));
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    return { ok: false, message: "Invalid season." };
  }

  const season = await getSubscriptionSeason(seasonId);
  if (!season) return { ok: false, message: "Season not found." };

  const result = await subscribePlayer(seasonId, Number(playerId), season.termsVersion);
  if (!result.ok) {
    const message =
      result.reason === "full"
        ? "All core places are taken. Ask an admin to put you on the reserve list."
        : result.reason === "closed"
          ? "Sign-up for this season is closed."
          : "Subscriptions are not open for this season.";
    return { ok: false, message };
  }

  revalidateAll();
  return {
    ok: true,
    message: result.alreadySubscribed
      ? "You already hold a place for this season."
      : "You're in for the season — you'll be marked IN for every match automatically.",
  };
}

export async function withdrawAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) return { ok: false, message: "Not allowed." };

  const seasonId = Number(formData.get("seasonId"));
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    return { ok: false, message: "Invalid season." };
  }

  await withdrawPlayer(seasonId, Number(playerId));
  revalidateAll();
  return {
    ok: true,
    message:
      "Your place has been released. You remain responsible for any amount already due — settle it with the admins.",
  };
}
