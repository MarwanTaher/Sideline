import * as React from "react";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-black/10 p-4 dark:border-white/10 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
