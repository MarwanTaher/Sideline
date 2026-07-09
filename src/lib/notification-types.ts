/**
 * Catalog of notification types. Single source of truth for the push triggers
 * the app knows about, their default audience, and whether an admin may
 * override the audience to "admins only".
 *
 * Plain data + helpers (no server-only imports) so it can be shared between the
 * push senders and the admin UI.
 */

/** Natural audience for a notification type. */
export type NotificationAudience = "all" | "players" | "admins";

/** Admin-configurable audience mode: keep the default, or force admins only. */
export type AudienceMode = "default" | "admins";

export type NotificationTypeKey =
  | "match_created"
  | "match_activated"
  | "availability_open"
  | "payment_due"
  | "stats_approved"
  | "new_player"
  | "announcement";

export type NotificationType = {
  key: NotificationTypeKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** Who the trigger sends to by default. */
  audience: NotificationAudience;
  /** Whether an admin may redirect this type to admin devices only. */
  audienceOverridable: boolean;
  /** Whether individual users may opt out of this type. */
  userConfigurable: boolean;
};

export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: "match_created",
    label: "New match — set availability",
    description:
      "Sent to everyone when a new match is created, asking them to mark in or out.",
    defaultEnabled: true,
    audience: "all",
    audienceOverridable: true,
    userConfigurable: true,
  },
  {
    key: "match_activated",
    label: "Match is live",
    description: "Sent to everyone when a matchday is activated.",
    defaultEnabled: true,
    audience: "all",
    audienceOverridable: true,
    userConfigurable: true,
  },
  {
    key: "availability_open",
    label: "Availability open — set in/out",
    description:
      "Sent to everyone when an admin opens availability for a match, asking them to mark in or out.",
    defaultEnabled: true,
    audience: "all",
    audienceOverridable: true,
    userConfigurable: true,
  },
  {
    key: "payment_due",
    label: "Payment reminder",
    description:
      "Sent to players with an outstanding payment when an admin sends a reminder.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: true,
    userConfigurable: true,
  },
  {
    key: "stats_approved",
    label: "Stats approved",
    description:
      "Sent to a player when their submitted goals/assists are approved.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: true,
    userConfigurable: true,
  },
  {
    key: "new_player",
    label: "New player joined",
    description: "Sent to admins when someone registers a new account.",
    defaultEnabled: true,
    audience: "admins",
    audienceOverridable: false,
    userConfigurable: false,
  },
  {
    key: "announcement",
    label: "Announcement",
    description: "Manual broadcasts you send from this page.",
    defaultEnabled: true,
    audience: "all",
    audienceOverridable: true,
    userConfigurable: false,
  },
];

const BY_KEY = new Map<NotificationTypeKey, NotificationType>(
  NOTIFICATION_TYPES.map((t) => [t.key, t]),
);

export function getNotificationType(
  key: string,
): NotificationType | undefined {
  return BY_KEY.get(key as NotificationTypeKey);
}

export function isNotificationTypeKey(key: string): key is NotificationTypeKey {
  return BY_KEY.has(key as NotificationTypeKey);
}

/** Types that individual users may opt out of. */
export const USER_CONFIGURABLE_TYPES: NotificationType[] =
  NOTIFICATION_TYPES.filter((t) => t.userConfigurable);

/** Settings key holding the on/off flag for a type. */
export function typeEnabledSettingKey(key: NotificationTypeKey): string {
  return `push_type_${key}`;
}

/** Settings key holding the audience mode for a type. */
export function typeAudienceSettingKey(key: NotificationTypeKey): string {
  return `push_type_${key}_audience`;
}
