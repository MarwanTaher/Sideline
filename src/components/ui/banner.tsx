import * as React from "react";

export type BannerTone = "success" | "error" | "warning" | "info";

const tones: Record<BannerTone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  error:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
};

export type BannerProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: BannerTone;
  /** Renders as role="alert" with aria-live for screen-reader announcement. */
  alert?: boolean;
};

export function Banner({
  tone = "info",
  alert = true,
  className = "",
  children,
  ...rest
}: BannerProps) {
  return (
    <div
      role={alert ? "alert" : undefined}
      aria-live={alert ? "polite" : undefined}
      className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Convenience for the app-wide `{ ok, message }` feedback pattern.
 * Renders nothing when there is no message.
 */
export function FeedbackMessage({
  ok,
  message,
  className = "",
}: {
  ok: boolean;
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      role="alert"
      aria-live="polite"
      className={`text-sm ${
        ok
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-red-700 dark:text-red-400"
      } ${className}`.trim()}
    >
      {message}
    </p>
  );
}
