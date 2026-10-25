import { getPlayerDevices } from "@/lib/push";
import { removeMyDeviceAction } from "@/app/actions/push";

/** Derive a short, friendly label from a user-agent string. */
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

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** The player's own subscribed devices, with a remove action per device. */
export default async function NotificationPreferences({
  playerId,
}: {
  playerId: number;
}) {
  const devices = await getPlayerDevices(playerId);

  return (
    <div className="mt-4">
      <div>
        <h3 className="text-sm font-medium">My devices</h3>
        <p className="text-sm text-neutral-500">
          Which notification types you receive is managed by the admins.
        </p>
        {devices.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            No devices are subscribed yet. Enable notifications above to add
            this one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {deviceLabel(d.userAgent)}
                  </p>
                  {formatDate(d.createdAt) ? (
                    <p className="text-xs text-neutral-500">
                      Added {formatDate(d.createdAt)}
                    </p>
                  ) : null}
                </div>
                <form action={removeMyDeviceAction} className="shrink-0">
                  <input type="hidden" name="endpoint" value={d.endpoint} />
                  <button
                    type="submit"
                    className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-white/15 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
