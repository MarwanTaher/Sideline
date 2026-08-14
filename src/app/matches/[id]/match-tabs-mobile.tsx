"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import type { SectionIconName } from "@/components/section-icon";

export type MatchTab = { href: string; icon: SectionIconName; text: string };

type IconProps = { className?: string };

function BackIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

/**
 * Mobile-only bottom bar for the pages of a single match. Mirrors the app's
 * primary bottom nav so section switching feels native; a leading "Back" tab
 * returns to the match list. Horizontally scrollable when a match has many
 * sections (admin/scorer). The desktop tab strip lives in MatchNav.
 */
export function MatchTabsMobile({
  tabs,
  matchId,
}: {
  tabs: MatchTab[];
  matchId: number;
}) {
  const pathname = usePathname();
  const overviewHref = `/matches/${matchId}`;

  const itemCls = (active: boolean) =>
    `flex min-w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition ${
      active
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-500 dark:text-neutral-400"
    }`;

  return (
    <nav
      aria-label="Match sections"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch overflow-x-auto border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-neutral-950/95"
    >
      <Link
        href="/matches"
        className="flex min-w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
      >
        <BackIcon className="h-6 w-6" />
        Back
      </Link>
      <span className="my-2 w-px shrink-0 self-stretch bg-black/10 dark:bg-white/10" aria-hidden="true" />
      {tabs.map((t) => {
        const Icon = ICONS[t.icon];
        const active =
          t.href === overviewHref
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={itemCls(active)}
          >
            <Icon className="h-6 w-6" />
            {t.text}
          </Link>
        );
      })}
    </nav>
  );
}
