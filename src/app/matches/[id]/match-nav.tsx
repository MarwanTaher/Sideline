import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon, type SectionIconName } from "@/components/section-icon";

function TabLabel({ icon, text }: { icon: SectionIconName; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <SectionIcon name={icon} className="h-4 w-4" />
      {text}
    </span>
  );
}

/**
 * Secondary navigation shared across the pages of a single match.
 * Rendered on the server; delegates active-state to the client SubNav.
 */
export function MatchNav({
  matchId,
  isAdmin,
  className = "mt-4",
}: {
  matchId: number;
  isAdmin: boolean;
  className?: string;
}) {
  const items = [
    { href: `/matches/${matchId}`, label: <TabLabel icon="matches" text="Overview" /> },
    { href: `/matches/${matchId}/availability`, label: <TabLabel icon="availability" text="Availability" /> },
    { href: `/matches/${matchId}/vote`, label: <TabLabel icon="votes" text="Rate players" /> },
    { href: `/matches/${matchId}/stats`, label: <TabLabel icon="stats" text="Stats" /> },
    ...(isAdmin ? [{ href: `/matches/${matchId}/draft`, label: <TabLabel icon="draft" text="Draft" /> }] : []),
  ];
  return <SubNav items={items} ariaLabel="Match sections" className={className} />;
}
