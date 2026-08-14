import * as React from "react";

/**
 * Brand section icons for Sideline. A rounded app-icon tile with a themed
 * glyph and a single emerald accent. The tile + glyph flip with the color
 * scheme: light tile + dark glyph in light mode, dark tile + light glyph in
 * dark mode (via the `--si-tile` custom property and `currentColor`). The
 * emerald accent stays constant so the mark reads on both surfaces.
 */
export type SectionIconName =
  | "dashboard"
  | "matches"
  | "leaderboard"
  | "awards"
  | "votes"
  | "stats"
  | "availability"
  | "profile"
  | "payments"
  | "players"
  | "scoring"
  | "draft"
  | "diagnostics";

const glyphs: Record<SectionIconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="55" y="55" width="40" height="40" rx="9" fill="currentColor" />
      <rect x="105" y="55" width="40" height="40" rx="9" fill="#10b981" />
      <rect x="55" y="105" width="40" height="40" rx="9" fill="currentColor" />
      <rect x="105" y="105" width="40" height="40" rx="9" fill="currentColor" />
    </>
  ),
  matches: (
    <>
      <circle cx="100" cy="100" r="46" fill="none" stroke="currentColor" strokeWidth="8" />
      <path d="M100 78 L120.9 93.2 L112.9 117.8 L87.1 117.8 L79.1 93.2 Z" fill="#10b981" />
      <path
        d="M100 78 V64 M120.9 93.2 L134 84 M112.9 117.8 L121 131 M87.1 117.8 L79 131 M79.1 93.2 L66 84"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </>
  ),
  leaderboard: (
    <>
      <rect x="56" y="100" width="26" height="46" rx="6" fill="currentColor" />
      <rect x="87" y="72" width="26" height="74" rx="6" fill="#10b981" />
      <rect x="118" y="116" width="26" height="30" rx="6" fill="currentColor" />
    </>
  ),
  awards: (
    <>
      <path
        d="M68 62 H132 V80 C132 101 117 113 100 113 C83 113 68 101 68 80 Z"
        fill="#10b981"
      />
      <path d="M68 70 C54 70 54 92 70 92" fill="none" stroke="currentColor" strokeWidth="7" />
      <path d="M132 70 C146 70 146 92 130 92" fill="none" stroke="currentColor" strokeWidth="7" />
      <rect x="92" y="111" width="16" height="16" fill="currentColor" />
      <rect x="76" y="126" width="48" height="13" rx="4" fill="currentColor" />
    </>
  ),
  votes: (
    <path
      d="M100 60 L110 86.2 L138 87.6 L116.2 105.3 L123.5 132.4 L100 117 L76.5 132.4 L83.8 105.3 L62 87.6 L90 86.2 Z"
      fill="#10b981"
    />
  ),
  stats: (
    <>
      <polyline
        points="58,132 82,108 106,118 140,70"
        fill="none"
        stroke="#10b981"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M140 70 L126 70 M140 70 L140 84" stroke="#10b981" strokeWidth="8" strokeLinecap="round" />
      <circle cx="58" cy="132" r="5" fill="currentColor" />
      <circle cx="82" cy="108" r="5" fill="currentColor" />
      <circle cx="106" cy="118" r="5" fill="currentColor" />
    </>
  ),
  availability: (
    <>
      <rect x="54" y="62" width="92" height="82" rx="12" fill="none" stroke="currentColor" strokeWidth="8" />
      <line x1="54" y1="86" x2="146" y2="86" stroke="currentColor" strokeWidth="8" />
      <line x1="78" y1="54" x2="78" y2="70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <line x1="122" y1="54" x2="122" y2="70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M76 112 L92 128 L124 96"
        fill="none"
        stroke="#10b981"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  profile: (
    <>
      <circle cx="100" cy="100" r="44" fill="none" stroke="#10b981" strokeWidth="8" />
      <circle cx="100" cy="88" r="15" fill="currentColor" />
      <path d="M74 130 C74 110 126 110 126 130 Z" fill="currentColor" />
    </>
  ),
  payments: (
    <>
      <rect x="52" y="72" width="96" height="56" rx="12" fill="currentColor" />
      <circle cx="100" cy="100" r="16" fill="#10b981" />
      <circle cx="65" cy="100" r="4" fill="var(--si-tile)" />
      <circle cx="135" cy="100" r="4" fill="var(--si-tile)" />
    </>
  ),
  players: (
    <>
      <circle cx="118" cy="82" r="15" fill="currentColor" />
      <path d="M96 130 C96 106 140 106 140 130 Z" fill="currentColor" />
      <circle cx="84" cy="88" r="17" fill="#10b981" />
      <path d="M58 138 C58 110 110 110 110 138 Z" fill="#10b981" />
    </>
  ),
  scoring: (
    <>
      <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="8" />
      <circle cx="100" cy="100" r="23" fill="none" stroke="currentColor" strokeWidth="8" />
      <circle cx="100" cy="100" r="9" fill="#10b981" />
    </>
  ),
  draft: (
    <>
      <circle cx="74" cy="84" r="12" fill="currentColor" />
      <circle cx="74" cy="116" r="12" fill="currentColor" />
      <circle cx="126" cy="84" r="12" fill="currentColor" />
      <circle cx="126" cy="116" r="12" fill="currentColor" />
      <rect x="96" y="54" width="8" height="92" rx="4" fill="#10b981" />
    </>
  ),
  diagnostics: (
    <path
      d="M58 100 H80 L90 76 L104 128 L116 100 H142"
      fill="none"
      stroke="#10b981"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export type SectionIconProps = {
  name: SectionIconName;
  /** Tailwind size classes, e.g. "h-9 w-9". */
  className?: string;
};

export function SectionIcon({ name, className = "h-9 w-9" }: SectionIconProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`text-neutral-900 [--si-tile:#ffffff] dark:text-white dark:[--si-tile:#0d0d0d] ${className}`}
      role="img"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="192"
        height="192"
        rx="40"
        fill="var(--si-tile)"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="2"
      />
      {glyphs[name]}
    </svg>
  );
}
