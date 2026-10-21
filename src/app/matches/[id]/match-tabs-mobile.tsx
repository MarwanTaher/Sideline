"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactElement } from "react";
import type { SectionIconName } from "@/components/section-icon";

export type MatchTab = {
  href: string;
  icon: SectionIconName;
  text: string;
  /** Admin-only section; grouped separately in the More sheet. */
  admin?: boolean;
};

type IconProps = { className?: string };

function BackIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
function OverviewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 5v14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function AvailabilityIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 14.3l2.2 2.2 4.2-4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RateIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 10l5.4-.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function StatsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 20v-6M12 20V5M18.5 20v-9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function PaymentsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function MatchdayIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
function DraftIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="4.5" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 4.5h5v2.4h-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 11.5h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const ICONS: Record<SectionIconName, (p: IconProps) => ReactElement> = {
  matches: OverviewIcon,
  availability: AvailabilityIcon,
  votes: RateIcon,
  stats: StatsIcon,
  payments: PaymentsIcon,
  scoring: MatchdayIcon,
  draft: DraftIcon,
  // Unused in the match bar, mapped for type completeness.
  dashboard: OverviewIcon,
  leaderboard: StatsIcon,
  awards: RateIcon,
  profile: OverviewIcon,
  players: OverviewIcon,
  diagnostics: StatsIcon,
};

export function NextDot() {
  return (
    <span aria-label="Next step" className="absolute -right-2 -top-1 flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
    </span>
  );
}

/**
 * Mobile-only bottom bar for a single match. A fixed set of primary tabs plus a
 * "More" sheet holds every section — no horizontal scrolling (which is
 * unreliable in the installed iOS PWA). A leading "Back" tab and a prominent
 * sheet action both return to the match list. The desktop tab strip lives in
 * MatchNav.
 */
export function MatchTabsMobile({
  tabs,
  matchId,
  highlightHref,
}: {
  tabs: MatchTab[];
  matchId: number;
  highlightHref?: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const overviewHref = `/matches/${matchId}`;

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === overviewHref
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  // Show the first three sections inline; the rest live in the More sheet.
  const primary = tabs.slice(0, 3);
  const overflow = tabs.slice(3);
  const moreActive = overflow.some((t) => isActive(t.href));
  const moreHighlight = overflow.some((t) => t.href === highlightHref);

  const itemCls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition ${
      active
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-500 dark:text-neutral-400"
    }`;

  const renderTile = (t: MatchTab) => {
    const Icon = ICONS[t.icon];
    const active = isActive(t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition ${
          active
            ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "border-black/10 text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <span className="relative">
          <Icon className="h-6 w-6" />
          {t.href === highlightHref && !active ? <NextDot /> : null}
        </span>
        {t.text}
      </Link>
    );
  };

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
            <Link
              href="/matches"
              className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-emerald-500"
            >
              <BackIcon className="h-5 w-5" />
              Back to all matches
            </Link>
            <div className="grid grid-cols-3 gap-1.5">
              {tabs.filter((t) => !t.admin).map(renderTile)}
            </div>

            {tabs.some((t) => t.admin) ? (
              <>
                <p className="mb-1 mt-4 px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Admin
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {tabs.filter((t) => t.admin).map(renderTile)}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Match sections"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-neutral-950/95"
      >
        <Link
          href="/matches"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium text-neutral-500 transition dark:text-neutral-400"
        >
          <BackIcon className="h-6 w-6" />
          Back
        </Link>
        {primary.map((t) => {
          const Icon = ICONS[t.icon];
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={itemCls(active)}
            >
              <span className="relative">
                <Icon className="h-6 w-6" />
                {t.href === highlightHref && !active ? <NextDot /> : null}
              </span>
              {t.text}
            </Link>
          );
        })}
        {overflow.length > 0 ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={itemCls(moreActive)}
          >
            <span className="relative">
              <MoreIcon className="h-6 w-6" />
              {moreHighlight && !moreActive ? <NextDot /> : null}
            </span>
            More
          </button>
        ) : null}
      </nav>
    </>
  );
}
