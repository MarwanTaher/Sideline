import * as React from "react";

export interface AnimatedLogoProps {
  /** Rendered width/height in pixels. */
  size?: number;
  /** When true, the strokes draw back and forth forever (for loading states). */
  loop?: boolean;
  className?: string;
}

/**
 * The Sideline mark, built from individual lines so each stroke can animate
 * itself "into place". Pure SVG + CSS (see globals.css) — no client JS.
 */
export function AnimatedLogo({ size = 96, loop = false, className = "" }: AnimatedLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label="Sideline"
      className={`sideline-logo${loop ? " sideline-logo--loop" : ""} ${className}`.trim()}
    >
      <rect className="s-bg" x="10" y="10" width="180" height="180" rx="40" fill="#0D0D0D" />
      <rect className="s-line s-line-1" x="50" y="65" width="80" height="6" fill="#FFFFFF" />
      <rect className="s-line s-line-2" x="40" y="97" width="90" height="6" fill="#FFFFFF" />
      <rect className="s-line s-line-3" x="50" y="129" width="80" height="6" fill="#FFFFFF" />
      <rect className="s-vline" x="145" y="55" width="6" height="90" fill="#059669" />
    </svg>
  );
}
