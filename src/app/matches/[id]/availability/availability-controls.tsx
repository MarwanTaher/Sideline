"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { setAvailabilityAction, type AvailabilityActionState } from "./actions";
import type { AvailabilityStatus } from "@/lib/availability";
import { formatDuration } from "@/lib/match-schedule";
import { FeedbackMessage } from "@/components/ui/banner";
import { CheckIcon, XIcon } from "@/components/ui/icons";

const INITIAL: AvailabilityActionState = { ok: false, message: "" };

/** Start nagging a day before the lock actually bites. */
const LOCK_WARNING_MS = 24 * 60 * 60 * 1000;

export interface AvailabilityControlsProps {
  matchId: number;
  currentStatus: AvailabilityStatus;
  open: boolean;
  locked?: boolean;
  /** Ms until changes close; negative once locked, null when not applicable. */
  msToLock?: number | null;
}

export function AvailabilityControls({
  matchId,
  currentStatus,
  open,
  locked = false,
  msToLock = null,
}: AvailabilityControlsProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setAvailabilityAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const banner =
    currentStatus === "in"
      ? { dot: "bg-emerald-500", label: "You're IN", sub: "See you on the pitch.", cls: "bg-emerald-50 dark:bg-emerald-950/30" }
      : currentStatus === "out"
        ? { dot: "bg-red-500", label: "You're OUT", sub: "You've marked yourself unavailable.", cls: "bg-red-50 dark:bg-red-950/30" }
        : { dot: "bg-amber-500", label: "No response yet", sub: "Let everyone know if you can play.", cls: "bg-amber-50 dark:bg-amber-950/30" };

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${banner.cls}`}>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${banner.dot}`} />
        <div>
          <p className="text-sm font-semibold">{banner.label}</p>
          <p className="text-xs text-neutral-500">{banner.sub}</p>
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <form action={formAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="status" value="in" />
            <button
              type="submit"
              disabled={pending || currentStatus === "in" || locked}
              className={`flex w-full flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                currentStatus === "in"
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : "border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${currentStatus === "in" ? "bg-white/20" : "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400"}`}>
                <CheckIcon className="h-5 w-5" />
              </span>
              I&apos;m IN
            </button>
          </form>
          <form action={formAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="status" value="out" />
            <button
              type="submit"
              disabled={pending || currentStatus === "out" || locked}
              className={`flex w-full flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                currentStatus === "out"
                  ? "border-red-600 bg-red-600 text-white shadow-sm"
                  : "border-red-600/40 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${currentStatus === "out" ? "bg-white/20" : "bg-red-600/10 text-red-600 dark:text-red-400"}`}>
                <XIcon className="h-5 w-5" />
              </span>
              I&apos;m OUT
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Availability is closed for this match.</p>
      )}

      {open && locked ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Availability is locked within 24 hours of kickoff. Please contact an
          admin if you need to change it.
        </p>
      ) : open && msToLock != null && msToLock > 0 && msToLock <= LOCK_WARNING_MS ? (
        <p className="mt-3 rounded-xl bg-amber-50/70 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Changes close in {formatDuration(msToLock)} — after that only an admin
          can change your availability.
        </p>
      ) : null}

      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}
