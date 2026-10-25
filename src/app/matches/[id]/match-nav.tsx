import { SubNav } from "@/components/ui/sub-nav";
import { SectionRail } from "@/components/ui/section-rail";
import { SectionIcon, type SectionIconName } from "@/components/section-icon";
import { MatchTabsMobile, NextDot, type MatchTab } from "./match-tabs-mobile";

function TabLabel({ icon, text }: { icon: SectionIconName; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <SectionIcon name={icon} className="h-4 w-4" />
      {text}
    </span>
  );
}

/**
 * Secondary navigation shared across the pages of a single match. On desktop
 * (lg+) it renders a left rail (SectionRail); on tablets a top tab strip; on
 * phones a fixed bottom bar (see MatchTabsMobile) so section switching feels
 * like the rest of the app.
 * The Payments tab is always shown; the page itself explains when payments
 * are not open yet.
 */
export function MatchNav({
  matchId,
  isAdmin,
  canScore = false,
  className = "mt-4",
  highlightHref,
}: {
  matchId: number;
  isAdmin: boolean;
  canScore?: boolean;
  className?: string;
  /** Tab to mark with a "do this next" dot (from phaseAction). */
  highlightHref?: string;
}) {
  const tabs: MatchTab[] = [
    { href: `/matches/${matchId}`, icon: "matches", text: "Overview" },
    { href: `/matches/${matchId}/availability`, icon: "availability", text: "Availability" },
    { href: `/matches/${matchId}/vote`, icon: "votes", text: "Rate" },
    { href: `/matches/${matchId}/stats`, icon: "stats", text: "Stats" },
    { href: `/matches/${matchId}/payments`, icon: "payments", text: "Payments" },
    ...(isAdmin || canScore
      ? [{ href: `/matches/${matchId}/matchday`, icon: "scoring", text: "Matchday", admin: true } as MatchTab]
      : []),
    ...(isAdmin
      ? [{ href: `/matches/${matchId}/draft`, icon: "draft", text: "Draft", admin: true } as MatchTab]
      : []),
  ];

  const items = tabs.map((t) => ({
    href: t.href,
    label: (
      <span className="relative inline-flex">
        <TabLabel icon={t.icon} text={t.text === "Rate" ? "Rate players" : t.text} />
        {t.href === highlightHref ? <NextDot /> : null}
      </span>
    ),
  }));

  // The rail matches nested section routes like the phone bar does.
  const railItems = items.map((item, i) => ({ ...item, startsWith: i > 0 }));

  return (
    <>
      <div className="hidden md:block lg:hidden">
        <SubNav items={items} ariaLabel="Match sections" className={className} />
      </div>
      <SectionRail items={railItems} ariaLabel="Match sections" heading="Match" />
      <MatchTabsMobile tabs={tabs} matchId={matchId} highlightHref={highlightHref} />
    </>
  );
}
