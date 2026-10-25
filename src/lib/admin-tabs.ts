/**
 * Canonical catalog of admin tabs that a super admin can lock/unlock per
 * admin account. Client-safe: no DB or server-only imports here so it can be
 * used in both client and server components.
 *
 * The `accounts` tab is intentionally excluded — it is super-only and cannot
 * be locked.
 *
 * Labels say "review"/"queue" because these pages span every match, unlike the
 * same-named tabs inside a single match.
 */
export const ADMIN_TABS = [
  { key: "votes", href: "/votes", label: "Votes review" },
  { key: "players", href: "/players", label: "Players" },
  { key: "stats", href: "/stats", label: "Stats review" },
  { key: "scoring", href: "/scoring", label: "Scoring queue" },
  { key: "diagnostics", href: "/diagnostics", label: "Diagnostics" },
  { key: "notifications", href: "/notifications", label: "Notifications" },
] as const;

export type AdminTabKey = (typeof ADMIN_TABS)[number]["key"];

/**
 * Tabs shown in the admin navigation menu. Diagnostics stays lockable but is
 * reached from Admin control instead, to keep the menu short.
 */
export const ADMIN_MENU_TABS = ADMIN_TABS.filter(
  (t) => t.key !== "diagnostics",
);

export const ADMIN_TAB_KEYS: readonly AdminTabKey[] = ADMIN_TABS.map(
  (t) => t.key,
);
