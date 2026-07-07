"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  saveSubscription,
  deleteSubscription,
  setPushEnabled,
  setNotificationTypeEnabled,
  setNotificationTypeAudience,
  notify,
  type SavedSubscription,
} from "@/lib/push";
import {
  isNotificationTypeKey,
  type AudienceMode,
} from "@/lib/notification-types";
import { getUnpaidPlayerIds } from "@/lib/payments";

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  const role = session?.user?.role;
  return role === "admin" || role === "super";
}


/**
 * Persist a browser push subscription for the signed-in user.
 * Player accounts are tied to their playerId; other accounts store a null id.
 */
export async function subscribePushAction(
  sub: SavedSubscription,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };

  const playerId =
    session.user.playerId != null ? Number(session.user.playerId) : null;
  const ua = (await headers()).get("user-agent") ?? "";

  await saveSubscription(playerId, sub, ua);
  return { ok: true };
}

/** Remove a push subscription (called when the user disables notifications). */
export async function unsubscribePushAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };

  await deleteSubscription(endpoint);
  return { ok: true };
}

/** Admin: turn the global push system on or off. */
export async function setPushEnabledAction(
  formData: FormData,
): Promise<void> {
  if (!(await requireAdmin())) return;
  const enabled = formData.get("enabled") === "1";
  await setPushEnabled(enabled);
  revalidatePath("/notifications");
}

/** Admin: broadcast an announcement to every subscriber. */
export async function sendAnnouncementAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: "Not authorized." };

  const title = String(formData.get("title") ?? "").trim() || "Sideline";
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "Message can't be empty." };

  await notify("announcement", { title, body, url: "/", tag: "announcement" });
  return { ok: true, message: "Announcement sent." };
}

/** Admin: remind players who haven't paid for a given match. */
export async function sendPaymentReminderAction(
  matchId: number,
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: "Not authorized." };

  const unpaid = await getUnpaidPlayerIds(matchId);
  if (unpaid.length === 0) {
    return { ok: true, message: "Everyone has already paid." };
  }

  await notify(
    "payment_due",
    {
      title: "Payment reminder \uD83D\uDCB0",
      body: `You have an outstanding payment for match ${matchId}. Please settle up.`,
      url: "/payments",
      tag: `payment-reminder-${matchId}`,
    },
    { playerIds: unpaid },
  );
  return {
    ok: true,
    message: `Reminder sent to ${unpaid.length} player${unpaid.length === 1 ? "" : "s"}.`,
  };
}

/** Admin: turn a single notification type on or off. */
export async function setNotificationTypeEnabledAction(
  formData: FormData,
): Promise<void> {
  if (!(await requireAdmin())) return;
  const key = String(formData.get("key") ?? "");
  if (!isNotificationTypeKey(key)) return;
  const enabled = formData.get("enabled") === "1";
  await setNotificationTypeEnabled(key, enabled);
  revalidatePath("/notifications");
}

/** Admin: set whether a notification type goes to everyone or admins only. */
export async function setNotificationTypeAudienceAction(
  formData: FormData,
): Promise<void> {
  if (!(await requireAdmin())) return;
  const key = String(formData.get("key") ?? "");
  if (!isNotificationTypeKey(key)) return;
  const mode: AudienceMode =
    String(formData.get("mode") ?? "") === "admins" ? "admins" : "default";
  await setNotificationTypeAudience(key, mode);
  revalidatePath("/notifications");
}

