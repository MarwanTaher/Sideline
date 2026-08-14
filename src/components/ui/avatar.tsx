import Image from "next/image";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

// Five non-emerald pastels (emerald is reserved for the brand). Cycled by name.
const PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
];

const px: Record<AvatarSize, number> = { xs: 26, sm: 32, md: 40, lg: 48 };
const sizeCls: Record<AvatarSize, string> = {
  xs: "h-[26px] w-[26px] text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function Avatar({
  name,
  photoUrl,
  size = "md",
  className = "",
}: {
  name: string | null | undefined;
  photoUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const label = (name ?? "").trim();
  const initial = (label.charAt(0) || "?").toUpperCase();
  const idx = (label.charCodeAt(0) || 0) % PALETTE.length;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-heading font-bold ${sizeCls[size]} ${
        photoUrl ? "bg-neutral-200 dark:bg-neutral-800" : PALETTE[idx]
      } ${className}`.trim()}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={px[size]}
          height={px[size]}
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}
