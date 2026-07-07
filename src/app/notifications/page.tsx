import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { sqlClient } from "@/lib/db";
import { isPushEnabled } from "@/lib/push";
import { setPushEnabledAction } from "@/app/actions/push";
import { SectionIcon } from "@/components/section-icon";
import AnnouncementForm from "./announcement-form";
import NotificationTypesSection from "./notification-types";

export const metadata = {
  title: "Notifications · Sideline",
};

export const dynamic = "force-dynamic";

export default async function NotificationsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  if (!isAdmin) redirect("/leaderboard");

  const [enabled, countRows] = await Promise.all([
    isPushEnabled(),
    sqlClient.query(`SELECT COUNT(*)::int AS n FROM push_subscriptions`),
  ]);
  const deviceCount = (countRows as Array<{ n: number }>)[0]?.n ?? 0;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="diagnostics" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {deviceCount} device{deviceCount === 1 ? "" : "s"} subscribed to push.
      </p>

      <section className="mt-8 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Push notifications</h2>
            <p className="text-sm text-neutral-500">
              {enabled
                ? "Push is ON — the app can send notifications."
                : "Push is OFF — no notifications will be sent to anyone."}
            </p>
          </div>
          <form action={setPushEnabledAction} className="shrink-0">
            <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
            <button
              type="submit"
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                (enabled
                  ? "border border-black/10 hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
                  : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200")
              }
            >
              {enabled ? "Disable" : "Enable"}
            </button>
          </form>
        </div>
      </section>

      <NotificationTypesSection globalEnabled={enabled} />

      <section className="mt-8 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Per-user control</h2>
            <p className="text-sm text-neutral-500">
              Enable or disable each notification type per player, and manage
              their devices.
            </p>
          </div>
          <a
            href="/notifications/users"
            className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
          >
            Manage
          </a>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Send announcement</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Broadcast a message to everyone who has enabled notifications.
        </p>
        <div className="mt-3">
          <AnnouncementForm disabled={!enabled} />
        </div>
      </section>
    </main>
  );
}
