"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const flash = (next: "copied" | "failed") => {
    setState(next);
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        if (!navigator.clipboard) return flash("failed");
        navigator.clipboard.writeText(value).then(
          () => flash("copied"),
          (error: unknown) => {
            console.error("Could not copy to the clipboard.", error);
            flash("failed");
          },
        );
      }}
      className={`min-h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition active:scale-95 ${
        state === "copied"
          ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : state === "failed"
            ? "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            : "border-black/10 bg-white/60 text-neutral-700 hover:bg-white dark:border-white/15 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-neutral-800"
      }`}
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Couldn't copy" : "Copy"}
    </button>
  );
}

export function CopyField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      <CopyButton value={value} label={label.toLowerCase()} />
    </div>
  );
}
