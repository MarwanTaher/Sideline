import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getPlayersNotificationMatrix } from "@/lib/push";
import { USER_CONFIGURABLE_TYPES } from "@/lib/notification-types";
import {
  setPlayerNotificationTypeAction,
  adminRemoveDeviceAction,
} from "@/app/actions/push";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Per-user notifications · Sideline",
};

export const dynamic = "force-dynamic";

function deviceLabel(ua: string): string {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad|iOS/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
      ? "Android"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} on ${os}`;
}

export default async function PerUserNotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  if (!isAdmin) redirect("/leaderboard");

  const players = await getPlayersNotificationMatrix();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="players" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Per-user notifications
        </h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Control which notification types each player receives, and manage their
        devices.{" "}
        <Link href="/notifications" className="underline">
          Back to notifications
        </Link>
      </p>

      <div className="mt-8 space-y-4">
        {players.map((p) => (
          <section
            key={p.playerId}
            className="rounded-xl border border-black/10 p-4 dark:border-white/10"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{p.name}</h2>
              <span className="text-xs text-neutral-500">
                {p.devices.length} device{p.devices.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {USER_CONFIGURABLE_TYPES.map((t) => {
                const enabled = p.prefs[t.key] ?? true;
                return (
                  <form
                    key={t.key}
                    action={setPlayerNotificationTypeAction}
                    className="inline-flex"
                  >
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <input type="hidden" name="key" value={t.key} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={enabled ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      title={t.description}
                      className={
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition " +
                        (enabled
                          ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "border-black/10 text-neutral-400 hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800")
                      }
                    >
                      <span
                        aria-hidden
                        className={
                          "h-1.5 w-1.5 rounded-full " +
                          (enabled ? "bg-emerald-500" : "bg-neutral-400")
                        }
                      />
                      {t.label}
                    </button>
                  </form>
                );
              })}
            </div>

            {p.devices.length > 0 ? (
              <ul className="mt-3 divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
                {p.devices.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 p-2.5"
                  >
                    <span className="truncate text-xs text-neutral-600 dark:text-neutral-300">
                      {deviceLabel(d.userAgent)}
                    </span>
                    <form action={adminRemoveDeviceAction} className="shrink-0">
                      <input type="hidden" name="endpoint" value={d.endpoint} />
                      <button
                        type="submit"
                        className="rounded-md border border-black/10 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-white/15 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        {players.length === 0 ? (
          <p className="text-sm text-neutral-500">No active players.</p>
        ) : null}
      </div>
    </main>
  );
}
