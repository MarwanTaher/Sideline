import {
  getNotificationTypeStatuses,
  type NotificationTypeStatus,
} from "@/lib/push";
import type { NotificationAudience } from "@/lib/notification-types";
import {
  setNotificationTypeEnabledAction,
  setNotificationTypeAudienceAction,
} from "@/app/actions/push";

/** Human label for a non-overridable type's fixed audience. */
function fixedAudienceLabel(audience: NotificationAudience): string {
  switch (audience) {
    case "admins":
      return "Admins only";
    case "players":
      return "Players only";
    default:
      return "Everyone";
  }
}

/** Admin controls for enabling/disabling and targeting each notification type. */
export default async function NotificationTypesSection({
  globalEnabled,
}: {
  globalEnabled: boolean;
}) {
  const types = await getNotificationTypeStatuses();

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">
        Notification types
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Choose which automatic notifications go out, and whether they reach
        everyone or admins only.
      </p>

      <div className="mt-3 divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
        {types.map((t) => (
          <TypeRow key={t.key} type={t} globalEnabled={globalEnabled} />
        ))}
      </div>

      {!globalEnabled ? (
        <p className="mt-2 text-sm text-neutral-500">
          Push is off — enable it above for these to take effect.
        </p>
      ) : null}
    </section>
  );
}

function TypeRow({
  type,
  globalEnabled,
}: {
  type: NotificationTypeStatus;
  globalEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{type.label}</h3>
        <p className="text-sm text-neutral-500">{type.description}</p>

        {type.audienceOverridable ? (
          <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <AudienceButton
              typeKey={type.key}
              mode="default"
              label="Everyone"
              active={type.audienceMode === "default"}
            />
            <AudienceButton
              typeKey={type.key}
              mode="admins"
              label="Admins only"
              active={type.audienceMode === "admins"}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-neutral-400">{fixedAudienceLabel(type.audience)}</p>
        )}
      </div>

      <form action={setNotificationTypeEnabledAction} className="shrink-0">
        <input type="hidden" name="key" value={type.key} />
        <input type="hidden" name="enabled" value={type.enabled ? "0" : "1"} />
        <button
          type="submit"
          disabled={!globalEnabled}
          className={
            "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 " +
            (type.enabled
              ? "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              : "border border-black/10 hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800")
          }
        >
          {type.enabled ? "On" : "Off"}
        </button>
      </form>
    </div>
  );
}

function AudienceButton({
  typeKey,
  mode,
  label,
  active,
}: {
  typeKey: string;
  mode: "default" | "admins";
  label: string;
  active: boolean;
}) {
  return (
    <form action={setNotificationTypeAudienceAction}>
      <input type="hidden" name="key" value={typeKey} />
      <input type="hidden" name="mode" value={mode} />
      <button
        type="submit"
        className={
          "px-3 py-1 text-xs font-medium transition " +
          (active
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800")
        }
      >
        {label}
      </button>
    </form>
  );
}
