import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";

/**
 * Desktop (lg+) left rail for a page's sections — the wide-screen counterpart
 * of the phone bottom bars and the tablet tab strip. Render it anywhere inside
 * the page's <main>: the `[data-section-rail]` rules in globals.css then give
 * that <main> a left gutter and pin the rail in it. Below lg it is not
 * displayed, so phone and tablet layouts are untouched.
 */
export function SectionRail({
  items,
  ariaLabel,
  heading,
  activeHref,
}: {
  items: SubNavItem[];
  ariaLabel: string;
  /** Small caption above the links, e.g. "Match". */
  heading?: string;
  activeHref?: string;
}) {
  return (
    <div data-section-rail className="hidden lg:block">
      {heading ? (
        <p
          aria-hidden="true"
          className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400"
        >
          {heading}
        </p>
      ) : null}
      <SubNav items={items} ariaLabel={ariaLabel} variant="rail" activeHref={activeHref} />
    </div>
  );
}

/**
 * Placeholder rail for route loading states, so the desktop layout does not
 * jump while a section loads (the loading <main> already pulses). Hidden
 * below lg.
 */
export function SectionRailSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div data-section-rail aria-hidden="true" className="hidden lg:block">
      <div className="mb-3 ml-3 h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="space-y-1.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-9 rounded-r-lg bg-neutral-200 dark:bg-neutral-800" />
        ))}
      </div>
    </div>
  );
}
