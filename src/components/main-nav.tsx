"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  /** Extra paths (besides href) that should mark this item active. */
  activePaths?: string[];
};

const linkBase = "transition";
const linkInactive =
  "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100";
const linkActive = "font-medium text-neutral-900 dark:text-neutral-100";

function isActive(pathname: string, item: NavItem): boolean {
  const candidates = [item.href, ...(item.activePaths ?? [])];
  return candidates.some((href) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`),
  );
}

export default function MainNav({
  adminView,
  isSuper,
}: {
  /** Whether admin chrome (Votes/Payments/Admin menu) should be shown. */
  adminView: boolean;
  /** Whether the current account is a super admin (adds Accounts). */
  isSuper: boolean;
}) {
  const pathname = usePathname();

  const primary: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Dashboard", show: true },
    { href: "/matches", label: "Matches", show: true },
    {
      href: "/leaderboard",
      label: "Leaderboard",
      activePaths: ["/awards"],
      show: true,
    },
    { href: "/payments", label: "Payments", show: !adminView },
  ];

  const adminItems: NavItem[] = [
    { href: "/votes", label: "Votes" },
    { href: "/payments", label: "Payments" },
    { href: "/players", label: "Players" },
    { href: "/stats", label: "Stats review" },
    { href: "/scoring", label: "Scoring" },
    { href: "/diagnostics", label: "Diagnostics" },
    { href: "/notifications", label: "Notifications" },
    ...(isSuper ? [{ href: "/admin/accounts", label: "Accounts" }] : []),
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
            className={`${linkBase} ${
              isActive(pathname, item) ? linkActive : linkInactive
            }`}
          >
            {item.label}
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
                    ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
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
