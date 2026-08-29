"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ADMIN_TABS, type AdminTabKey } from "@/lib/admin-tabs";

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
  adminView,
  isSuper,
  lockedTabs = [],
  signals,
}: {
  /** Whether admin chrome (Votes/Payments/Admin menu) should be shown. */
  adminView: boolean;
  /** Whether the current account is a super admin (adds Accounts). */
  isSuper: boolean;
  /** Tab keys locked for this admin by a super admin (hidden from the menu). */
  lockedTabs?: AdminTabKey[];
  /** Per-section "is there something new" signals for the nav dots. */
  signals?: { matches: string; leaderboard: string };
}) {
  const pathname = usePathname();

  const primary: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Dashboard", show: true },
    { href: "/matches", label: "Matches", show: true, signalKey: "matches" },
    {
      href: "/leaderboard",
      label: "Leaderboard",
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

  const locked = new Set(lockedTabs);
  const adminItems: NavItem[] = [
    ...ADMIN_TABS.filter((t) => !locked.has(t.key)).map((t) => ({
      href: t.href,
      label: t.label,
    })),
    ...(isSuper ? [{ href: "/admin/accounts", label: "Admin control" }] : []),
  ];

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

      {adminView ? (
        <AdminMenu items={adminItems} pathname={pathname} />
      ) : null}
    </div>
  );
}

function AdminMenu({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const anyActive = items.some((i) => isActive(pathname, i));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Collapse the submenu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className="w-full md:relative md:w-auto">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${linkBase} inline-flex items-center gap-1 ${
          anyActive ? linkActive : linkInactive
        }`}
      >
        Admin
        <svg
          className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="mt-2 w-full rounded-lg border border-black/10 bg-white p-1 dark:border-white/10 dark:bg-neutral-900 md:absolute md:right-0 md:z-20 md:w-auto md:min-w-40 md:shadow-lg"
        >
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
