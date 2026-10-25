"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
function SeasonIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
type Tab = {
  href: string;
  label: string;
  extra?: string[];
  Icon: (p: IconProps) => React.ReactElement;
};

// Awards is a sub-tab of Ranks; the account, view toggle and admin links live
// in the header avatar menu, so this bar needs no "More" sheet.
const TABS: Tab[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/matches", label: "Matches", Icon: BallIcon },
  { href: "/leaderboard", label: "Ranks", extra: ["/awards"], Icon: BarsIcon },
];

export default function BottomNav({ showSeason = false }: { showSeason?: boolean }) {
  const pathname = usePathname();

  // Inside a single match, on the season page, or in admin control, those
  // screens provide their own bottom bar — suppress the global one so the two
  // never stack.
  if (
    /^\/matches\/\d+(?:\/|$)/.test(pathname) ||
    pathname === "/season" ||
    pathname === "/admin/accounts"
  ) {
    return null;
  }

  const itemCls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
      active
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-500 dark:text-neutral-400"
    }`;

  const tabs: Tab[] = showSeason
    ? [...TABS, { href: "/season", label: "Season", Icon: SeasonIcon }]
    : TABS;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-black/10 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-neutral-950/90"
    >
      {tabs.map(({ href, label, extra, Icon }) => {
        const active = isActive(pathname, href, extra);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={itemCls(active)}>
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
