"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Responsive wrapper for the header navigation.
 *
 * On small screens the nav collapses behind a burger button and drops down as a
 * full-width stacked panel. From `md` upwards it renders inline as before.
 */
export default function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg border border-black/10 p-2 transition hover:bg-neutral-50 md:hidden dark:border-white/15 dark:hover:bg-neutral-800"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {open ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      <nav
        className={`${
          open ? "flex" : "hidden"
        } absolute inset-x-0 top-full flex-col items-start gap-4 border-b border-black/10 bg-white p-4 text-sm shadow-lg md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none dark:border-white/10 dark:bg-neutral-950 dark:md:bg-transparent`}
      >
        {children}
      </nav>
    </>
  );
}
