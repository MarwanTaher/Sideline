import * as React from "react";

export type DataTableProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Minimum width for the inner scroll area (e.g. "min-w-[640px]"). */
  innerClassName?: string;
};

/**
 * Horizontal-scroll wrapper for wide tables with a right-edge fade that hints
 * there is more content to scroll to on narrow screens.
 */
export function DataTable({
  className = "",
  innerClassName = "",
  children,
  ...rest
}: DataTableProps) {
  return (
    <div className={`relative ${className}`.trim()} {...rest}>
      <div className={`overflow-x-auto ${innerClassName}`.trim()}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent sm:hidden dark:from-neutral-950"
      />
    </div>
  );
}
