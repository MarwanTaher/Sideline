"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_TABS, type AdminTabKey } from "@/lib/admin-tabs";
import { setViewModeAction } from "@/app/actions/view-mode";

function isActive(pathname: string, href: string, extra: string[] = []): boolean {
  return [href, ...extra].some((h) =>
    h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`),
  );
}

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BallIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.2l4.2 3-1.6 4.9H9.4L7.8 10.2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function BarsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 20v-6M12 20V5M18.5 20v-9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function TrophyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5h10v3a5 5 0 0 1-10 0V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 6H5a2 2 0 0 0 2 3M17 6h2a2 2 0 0 1-2 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13v3M9 20h6M9.5 20l.6-4M14.5 20l-.6-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MoreIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  );
}

type Tab = {
  href: string;
  label: string;
  extra?: string[];
  Icon: (p: IconProps) => React.ReactElement;
};

const TABS: Tab[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/matches", label: "Matches", Icon: BallIcon },
  { href: "/leaderboard", label: "Ranks", Icon: BarsIcon },
  { href: "/awards", label: "Awards", Icon: TrophyIcon },
];

export default function BottomNav({
  adminView,
  isSuper,
  lockedTabs = [],
  canToggle,
  mode,
  signOutAction,
}: {
  adminView: boolean;
  isSuper: boolean;
  lockedTabs?: AdminTabKey[];
  canToggle: boolean;
  mode: string;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Inside a single match, the match's own bottom bar (MatchTabsMobile) takes
  // over, so suppress the global bar to avoid stacking two bottom navs.
  if (/^\/matches\/\d+(?:\/|$)/.test(pathname)) {
    return null;
  }

  const locked = new Set(lockedTabs);
  const adminItems = [
    ...ADMIN_TABS.filter((t) => !locked.has(t.key)).map((t) => ({
      href: t.href,
      label: t.label,
    })),
    ...(isSuper ? [{ href: "/admin/accounts", label: "Admin control" }] : []),
  ];

  const itemCls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
      active
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-500 dark:text-neutral-400"
    }`;

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-black/10 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl dark:border-white/10 dark:bg-neutral-950">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            {adminView && adminItems.length > 0 ? (
              <div className="mb-3">
                <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Admin
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {adminItems.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition dark:border-white/10 ${
                        isActive(pathname, it.href)
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {it.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {canToggle ? (
              <div
                role="group"
                aria-label="View as"
                className="mb-3 flex items-center gap-1 rounded-xl border border-black/10 p-1 dark:border-white/15"
              >
                {(["player", "admin"] as const).map((m) => (
                  <form key={m} action={setViewModeAction} className="flex-1">
                    <input type="hidden" name="mode" value={m} />
                    <button
                      type="submit"
                      aria-pressed={mode === m}
                      className={`w-full rounded-lg px-2 py-1.5 text-sm font-medium capitalize transition ${
                        mode === m
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                      }`}
                    >
                      View as {m}
                    </button>
                  </form>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-1.5">
              <Link
                href="/profile"
                className="rounded-xl border border-black/10 px-3 py-2 text-center text-sm font-medium transition hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800"
              >
                Profile
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-black/10 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-neutral-950/90"
      >
        {TABS.map(({ href, label, extra, Icon }) => {
          const active = isActive(pathname, href, extra);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={itemCls(active)}>
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} className={itemCls(false)}>
          <MoreIcon className="h-6 w-6" />
          More
        </button>
      </nav>
    </>
  );
}
