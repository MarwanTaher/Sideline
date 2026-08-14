import * as React from "react";

/**
 * Theme-aware Sideline logo mark. The tile flips with the color scheme (light
 * tile + dark strokes in light mode, dark tile + light strokes in dark mode)
 * via `--si-tile` and `currentColor`, with a constant emerald accent stroke.
 */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`text-neutral-900 [--si-tile:#ffffff] dark:text-white dark:[--si-tile:#0d0d0d] ${className}`}
      role="img"
      aria-hidden="true"
    >
      <rect
        x="10"
        y="10"
        width="180"
        height="180"
        rx="40"
        fill="var(--si-tile)"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="2"
      />
      <rect x="50" y="65" width="80" height="6" fill="currentColor" />
      <rect x="40" y="97" width="90" height="6" fill="currentColor" />
      <rect x="50" y="129" width="80" height="6" fill="currentColor" />
      <rect x="145" y="55" width="6" height="90" fill="#10b981" />
    </svg>
  );
}
