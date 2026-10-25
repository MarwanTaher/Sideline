import * as React from "react";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Accent-left colour (applied as an inset shadow, never a border override). */
  accent?: string;
};

export function Card({ className = "", accent, style, children, ...rest }: CardProps) {
  const accentStyle = accent
    ? { ...style, boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 2px rgba(0,0,0,0.06)` }
    : style;
  return (
    <div
      className={`rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm transition dark:border-white/10 dark:bg-neutral-900 ${className}`.trim()}
      style={accentStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
