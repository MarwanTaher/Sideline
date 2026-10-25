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
 * The active tab is derived from the current pathname, or from `activeHref`
 * when the sections are query-string tabs (e.g. `?tab=billing`).
 *
 * `variant="rail"` renders the same links as a vertical list for the desktop
 * left rail (see SectionRail); the default horizontal strip is unchanged.
 */
export function SubNav({
  items,
  className = "",
  ariaLabel = "Section navigation",
  variant = "tabs",
  activeHref,
}: {
  items: SubNavItem[];
  className?: string;
  ariaLabel?: string;
  variant?: "tabs" | "rail";
  /** Overrides pathname matching: the item with this exact href is active. */
  activeHref?: string;
}) {
  const pathname = usePathname();
  const isActive = (item: SubNavItem) =>
    activeHref !== undefined
      ? item.href === activeHref
      : item.startsWith
        ? pathname === item.href || pathname.startsWith(`${item.href}/`)
        : pathname === item.href;

  if (variant === "rail") {
    return (
      <nav aria-label={ariaLabel} className={`flex flex-col gap-0.5 ${className}`.trim()}>
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-10 items-center rounded-r-lg border-l-2 px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "border-neutral-900 bg-black/[0.04] text-neutral-900 dark:border-white dark:bg-white/[0.06] dark:text-white"
                  : "border-transparent text-neutral-500 hover:bg-black/[0.03] hover:text-neutral-900 dark:hover:bg-white/[0.04] dark:hover:text-neutral-100")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-1 border-b border-black/10 dark:border-white/10 ${className}`.trim()}
    >
      {items.map((item) => {
        const active = isActive(item);
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
