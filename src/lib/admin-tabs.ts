/**
 * Canonical catalog of admin tabs that a super admin can lock/unlock per
 * admin account. Client-safe: no DB or server-only imports here so it can be
 * used in both client and server components.
 *
 * The `accounts` tab is intentionally excluded — it is super-only and cannot
 * be locked.
 */
export const ADMIN_TABS = [
  { key: "votes", href: "/votes", label: "Votes" },
  { key: "players", href: "/players", label: "Players" },
  { key: "stats", href: "/stats", label: "Stats review" },
  { key: "scoring", href: "/scoring", label: "Scoring" },
  { key: "diagnostics", href: "/diagnostics", label: "Diagnostics" },
  { key: "notifications", href: "/notifications", label: "Notifications" },
] as const;

export type AdminTabKey = (typeof ADMIN_TABS)[number]["key"];

export const ADMIN_TAB_KEYS: readonly AdminTabKey[] = ADMIN_TABS.map(
  (t) => t.key,
);
