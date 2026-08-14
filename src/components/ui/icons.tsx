import * as React from "react";

/** Stroke-based UI icons (1.8px, rounded). Replaces emoji in production UI. */
type IconProps = { className?: string };

function Svg({ className, children, fill = "none" }: IconProps & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      className={className ?? "h-4 w-4"}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === "none" ? "currentColor" : "none"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CheckIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const XIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const BallIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.2l4.2 3-1.6 4.9H9.4L7.8 10.2z" />
  </Svg>
);

export const BarsIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5.5 20v-6M12 20V5M18.5 20v-9" />
  </Svg>
);

export const LockIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const KeyIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="8" cy="15" r="3.2" />
    <path d="M10.3 12.7 20 3m-3 3 2 2m-4.5-.5 2 2" />
  </Svg>
);

export const TrophyIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M7 5h10v3a5 5 0 0 1-10 0V5z" />
    <path d="M7 6H5a2 2 0 0 0 2 3M17 6h2a2 2 0 0 1-2 3" />
    <path d="M12 13v3M9 20h6M9.5 20l.6-4M14.5 20l-.6-4" />
  </Svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 9.5h16M8 3.5v4M16 3.5v4" />
  </Svg>
);

export const SwapIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M7 8h11l-3-3M17 16H6l3 3" />
  </Svg>
);

export const UndoIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9 8 5 12l4 4" />
    <path d="M5 12h9a4 4 0 0 1 0 8h-2" />
  </Svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

/** Solid rank medal with the position number. */
export const MedalIcon = ({
  className,
  place,
}: IconProps & { place: number }) => {
  const tone =
    place === 1
      ? "text-amber-500"
      : place === 2
        ? "text-neutral-400"
        : "text-orange-700 dark:text-orange-500";
  return (
    <svg
      className={`${className ?? "h-4 w-4"} ${tone}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="14" r="7" />
      <path d="M8.5 3h2l1.5 4-3-1zM15.5 3h-2L12 7l3-1z" opacity="0.7" />
      <text x="12" y="17" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">
        {place}
      </text>
    </svg>
  );
};
