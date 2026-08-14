import * as React from "react";
import Image from "next/image";

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
      className={`flex flex-col items-center rounded-2xl border border-black/[0.06] bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 ${className}`.trim()}
    >
      <Image
        src="/empty-state.png"
        alt=""
        width={240}
        height={180}
        className="mb-3 h-auto w-40 select-none"
      />
      {title ? (
        <p className="font-semibold text-neutral-700 dark:text-neutral-200">
          {title}
        </p>
      ) : null}
      {children ? <div className="mt-1 max-w-sm">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
