"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type IconProps = { className?: string };

function OverviewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function PaymentsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 14.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CardIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13.5 10.5h4M13.5 13.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function FundIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5V10M9.3 19.5V6.5M14.7 19.5v-6M20 19.5V8.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TABS = [
  { key: "", label: "Overview", href: "/season", Icon: OverviewIcon },
  { key: "payments", label: "Payments", href: "/season?tab=payments", Icon: PaymentsIcon },
  { key: "multisport", label: "MultiSport", href: "/season?tab=multisport", Icon: CardIcon },
  { key: "fund", label: "Fund", href: "/season?tab=fund", Icon: FundIcon },
] as const;

/**
 * Mobile bottom bar for the season sections, matching the per-match bar. The
 * global bar is suppressed on /season so the two never stack.
 */
export default function SeasonTabsMobile() {
  const params = useSearchParams();
  const active = params.get("tab") ?? "";

  return (
    <nav
      aria-label="Season sections"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-neutral-950/95"
    >
      <Link
        href="/"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium text-neutral-500 transition dark:text-neutral-400"
      >
        <HomeIcon className="h-6 w-6" />
        Home
      </Link>
      {TABS.map(({ key, label, href, Icon }) => {
        const isActive = active === key;
        return (
          <Link
            key={label}
            href={href}
            prefetch
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition ${
              isActive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
