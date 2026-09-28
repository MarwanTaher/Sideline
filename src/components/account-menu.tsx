"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { setViewModeAction } from "@/app/actions/view-mode";

export type AccountMenuItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Everything account-related behind the avatar: view toggle, admin links,
 * profile and sign out. Anchored to the sticky header so it stays reachable on
 * pages that swap out the bottom bar (inside a match, notably).
 *
 * Rendered as a dropdown rather than a bottom sheet because the header's
 * backdrop-blur creates a containing block, which breaks `position: fixed`.
 */
export default function AccountMenu({
  name,
  photoUrl,
  roleLabel,
  adminView,
  canToggle,
  mode,
  adminItems,
  signOutAction,
}: {
  name: string;
  photoUrl: string | null;
  roleLabel: string;
  adminView: boolean;
  canToggle: boolean;
  mode: "player" | "admin";
  adminItems: AccountMenuItem[];
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The ring doubles as the always-visible "which mode am I in" cue.
  const ring = !canToggle
    ? "ring-black/5 dark:ring-white/10"
    : adminView
      ? "ring-amber-500/80"
      : "ring-emerald-500/70";

  const tileCls =
    "rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex rounded-full ring-2 transition hover:ring-emerald-600/40 ${ring}`}
      >
        <Avatar name={name} photoUrl={photoUrl} size="sm" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 max-h-[75vh] w-64 overflow-y-auto rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-neutral-950"
        >
          <div className="flex items-center gap-3 px-1 pb-3">
            <Avatar name={name} photoUrl={photoUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="text-xs capitalize text-neutral-500">{roleLabel}</p>
            </div>
          </div>

          {canToggle ? (
            <div className="mb-3">
              <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                View as
              </p>
              <div
                role="group"
                aria-label="View as"
                className="flex items-center gap-1 rounded-xl border border-black/10 p-1 dark:border-white/15"
              >
                {(["player", "admin"] as const).map((m) => (
                  <form key={m} action={setViewModeAction} className="flex-1">
                    <input type="hidden" name="mode" value={m} />
                    <button
                      type="submit"
                      aria-pressed={mode === m}
                      className={`w-full rounded-lg px-2 py-1.5 text-sm font-medium capitalize transition ${
                        mode === m
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                      }`}
                    >
                      {m}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}

          {adminView && adminItems.length > 0 ? (
            <div className="mb-3">
              <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Admin
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {adminItems.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    role="menuitem"
                    aria-current={isActive(pathname, it.href) ? "page" : undefined}
                    className={`${tileCls} ${
                      isActive(pathname, it.href)
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : ""
                    }`}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-1.5">
            <Link href="/profile" role="menuitem" className={`${tileCls} text-center`}>
              Profile
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={`w-full ${tileCls}`}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
