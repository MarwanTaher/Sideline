import * as React from "react";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm transition dark:border-white/10 dark:bg-neutral-900 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
