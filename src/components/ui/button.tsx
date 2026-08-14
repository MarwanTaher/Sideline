import * as React from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "danger"
  | "success"
  | "ghost";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition select-none " +
  "active:scale-[0.98] " +
  "disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:ring-emerald-600/50 " +
    "dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400",
  secondary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 focus-visible:ring-neutral-900/20 " +
    "dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
  outline:
    "border border-emerald-600 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-600/40 " +
    "dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-600/50",
  success:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:ring-emerald-600/50",
  ghost:
    "hover:bg-neutral-100 focus-visible:ring-neutral-900/20 " +
    "dark:hover:bg-neutral-800 dark:focus-visible:ring-white/20",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-[30px] px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className = "" } = opts ?? {};
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true, disables the button, shows a spinner, and swaps the label. */
  pending?: boolean;
  /** Optional label to show while `pending` (defaults to children). */
  pendingLabel?: React.ReactNode;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      pending = false,
      pendingLabel,
      className = "",
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={buttonClass({ variant, size, className })}
        {...rest}
      >
        {pending ? <Spinner /> : null}
        {pending ? (pendingLabel ?? children) : children}
      </button>
    );
  },
);
