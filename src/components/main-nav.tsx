"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";

type NavItem = {
  href: string;
  label: string;
  /** Extra paths (besides href) that should mark this item active. */
  activePaths?: string[];
  /** localStorage key + signal used to show a "since last seen" dot. */
  signalKey?: "matches" | "leaderboard";
};

const linkBase = "transition";
const linkInactive =
  "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100";
const linkActive = "font-semibold text-emerald-600 dark:text-emerald-400";

const SEEN_STORAGE_PREFIX = "sideline_seen_";

function isActive(pathname: string, item: NavItem): boolean {
  const candidates = [item.href, ...(item.activePaths ?? [])];
  return candidates.some((href) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`),
  );
}

/** Read a localStorage value as external state (SSR-safe, no setState-in-effect). */
function useStoredValue(key: string): string | null {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export default function MainNav({
  signals,
}: {
  /** Per-section "is there something new" signals for the nav dots. */
  signals?: { matches: string; leaderboard: string };
}) {
  const pathname = usePathname();

  const primary: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Home", show: true },
    { href: "/matches", label: "Matches", show: true, signalKey: "matches" },
    {
      href: "/leaderboard",
      label: "Ranks",
      activePaths: ["/awards"],
      show: true,
      signalKey: "leaderboard",
    },
  ];

  // Last-seen signals from localStorage, read as external state.
  const seenMatches = useStoredValue(`${SEEN_STORAGE_PREFIX}matches`);
  const seenLeaderboard = useStoredValue(`${SEEN_STORAGE_PREFIX}leaderboard`);
  const seenByKey: Record<string, string | null> = {
    matches: seenMatches,
    leaderboard: seenLeaderboard,
  };

  // Visiting a section marks its current signal as seen (side-effect only).
  useEffect(() => {
    if (!signals) return;
    for (const item of primary) {
      if (item.signalKey && isActive(pathname, item)) {
        try {
          window.localStorage.setItem(
            `${SEEN_STORAGE_PREFIX}${item.signalKey}`,
            signals[item.signalKey],
          );
        } catch {
          // ignore storage errors (private mode etc.)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, signals?.matches, signals?.leaderboard]);

  // A dot shows when a section has an unseen update and we're not on it.
  // First-ever visit (seen == null) is treated as seen to avoid a dot storm.
  function hasUnseen(item: NavItem): boolean {
    if (!signals || !item.signalKey) return false;
    if (isActive(pathname, item)) return false;
    const current = signals[item.signalKey];
    const seen = seenByKey[item.signalKey];
    return seen != null && seen !== current;
  }

  return (
    <div className="flex flex-col items-start gap-3 text-sm md:flex-row md:items-center md:gap-4">
      {primary
        .filter((i) => i.show)
        .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item) ? "page" : undefined}
            className={`${linkBase} relative ${
              isActive(pathname, item) ? linkActive : linkInactive
            }`}
          >
            {item.label}
            {hasUnseen(item) ? (
              <span
                aria-label="new"
                className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-500"
              />
            ) : null}
          </Link>
        ))}
    </div>
  );
}
