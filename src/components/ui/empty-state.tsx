import * as React from "react";

export type EmptyStateProps = {
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  children,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-black/10 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 ${className}`.trim()}
    >
      {title ? (
        <p className="font-medium text-neutral-700 dark:text-neutral-300">
          {title}
        </p>
      ) : null}
      {children ? <div className="mt-1">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
