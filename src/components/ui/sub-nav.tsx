"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SubNavItem = {
  href: string;
  label: React.ReactNode;
  /** Match when the pathname starts with href (for nested routes). */
  startsWith?: boolean;
};

/**
 * Accessible secondary navigation rendered as a tablist of links.
 * The active tab is derived from the current pathname.
 */
export function SubNav({
  items,
  className = "",
  ariaLabel = "Section navigation",
}: {
  items: SubNavItem[];
  className?: string;
  ariaLabel?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-1 border-b border-black/10 dark:border-white/10 ${className}`.trim()}
    >
      {items.map((item) => {
        const active = item.startsWith
          ? pathname === item.href || pathname.startsWith(`${item.href}/`)
          : pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition " +
              (active
                ? "border-neutral-900 text-neutral-900 dark:border-white dark:text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
