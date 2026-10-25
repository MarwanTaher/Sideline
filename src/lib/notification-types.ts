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
  | "teams_published"
  | "availability_open"
  | "availability_locked"
  | "availability_reminder"
  | "payment_due"
  | "stats_approved"
  | "results_in"
  | "rating_changed"
  | "waitlist_promoted"
  | "new_player"
  | "guest_request"
  | "guest_decision"
  | "achievement_unlocked"
  | "kudos"
  | "announcement"
  | "seat_offer_posted"
  | "seat_offer_requested"
  | "seat_offer_approved";

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
    key: "teams_published",
    label: "Teams are out",
    description: "Sent to each rostered player when an admin publishes the teams, with their side.",
    defaultEnabled: true,
    audience: "players",
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
    key: "availability_reminder",
    label: "Availability reminder",
    description:
      "Sent automatically to anyone who hasn't marked themselves in or out, shortly before changes close.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
  },
  {
    key: "availability_locked",
    label: "Availability locked",
    description:
      "Sent when the availability deadline passes, with the confirmed player count or waitlist position. Off by default: on the Hobby plan it can arrive up to a day late.",
    defaultEnabled: false,
    audience: "players",
    audienceOverridable: false,
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
    key: "results_in",
    label: "Results are in",
    description:
      "Sent to everyone when a matchday is closed and ratings are finalised, nudging them to see how they did.",
    defaultEnabled: true,
    audience: "all",
    audienceOverridable: true,
    userConfigurable: true,
  },
  {
    key: "rating_changed",
    label: "Your rating changed",
    description:
      "A personalised nudge when a player's rating or rank moves meaningfully after a matchday closes.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
  },
  {
    key: "waitlist_promoted",
    label: "Waitlist spot opened",
    description:
      "Sent to a waitlisted player when a spot opens up and they are automatically moved into the match.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
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
    key: "guest_request",
    label: "Guest request",
    description: "Sent to admins when a player requests to bring a guest.",
    defaultEnabled: true,
    audience: "admins",
    audienceOverridable: false,
    userConfigurable: false,
  },
  {
    key: "guest_decision",
    label: "Guest request decision",
    description:
      "Sent to the host when an admin approves or declines their guest request.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
  },
  {
    key: "achievement_unlocked",
    label: "Achievement unlocked",
    description:
      "Sent to a player when they unlock a new badge (hat-trick, appearances milestones, MOTM, and more).",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
  },
  {
    key: "kudos",
    label: "Kudos received",
    description:
      "Sent to a player when a teammate gives them kudos on their profile.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
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
  {
    key: "seat_offer_posted",
    label: "Season seat available",
    description:
      "Sent to players on a season match's waitlist when a subscriber offers their seat.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
  },
  {
    key: "seat_offer_requested",
    label: "Seat requested",
    description:
      "Sent to a subscriber when a waitlisted player asks for the seat they offered.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
  },
  {
    key: "seat_offer_approved",
    label: "Seat approved",
    description:
      "Sent to a waitlisted player when a subscriber gives them their seat, with what they owe.",
    defaultEnabled: true,
    audience: "players",
    audienceOverridable: false,
    userConfigurable: true,
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
