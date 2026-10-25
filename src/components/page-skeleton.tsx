import { SectionRailSkeleton } from "@/components/ui/section-rail";

const BAR = "bg-neutral-200 dark:bg-neutral-800";

/**
 * Route-level loading placeholder shaped like the page it stands in for, so a
 * tap shows the layout immediately instead of a blank screen.
 *  - "list": title + a column of rows (matches, players, leaderboard)
 *  - "detail": header card + tab strip + content cards (match, profile)
 */
export function PageSkeleton({
  variant = "list",
  rows = 6,
  rail = false,
}: {
  variant?: "list" | "detail";
  rows?: number;
  /** Reserve the desktop section rail (pages that render a SectionRail). */
  rail?: boolean;
}) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto w-full max-w-3xl flex-1 animate-pulse px-4 py-8"
    >
      {rail ? <SectionRailSkeleton rows={6} /> : null}
      {variant === "detail" ? (
        <>
          <div className={`h-36 rounded-3xl ${BAR}`} />
          <div className={`mt-4 flex gap-2${rail ? " lg:hidden" : ""}`}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-9 flex-1 rounded-full ${BAR}`} />
            ))}
          </div>
          <div className="mt-6 space-y-3">
            <div className={`h-28 rounded-2xl ${BAR}`} />
            <div className={`h-44 rounded-2xl ${BAR}`} />
            <div className={`h-20 rounded-2xl ${BAR}`} />
          </div>
        </>
      ) : (
        <>
          <div className={`h-8 w-48 rounded-lg ${BAR}`} />
          <div className={`mt-2 h-4 w-32 rounded ${BAR}`} />
          <div className="mt-6 space-y-2">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`h-10 w-10 shrink-0 rounded-full ${BAR}`} />
                <div className={`h-12 flex-1 rounded-xl ${BAR}`} />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
