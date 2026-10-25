"use client";

import { useEffect, useActionState, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { setAvailabilityAction, type AvailabilityActionState } from "./actions";
import type { AvailabilityStatus } from "@/lib/availability";
import { formatDuration } from "@/lib/match-schedule";
import { FeedbackMessage } from "@/components/ui/banner";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { useTapSpam } from "@/components/use-tap-spam";
import { TapSmoke } from "@/components/tap-smoke";
import { MessageAdminLink } from "@/components/message-admin-link";

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
  /** Core season subscriber — committed and billed whether they play or not. */
  isSubscriber?: boolean;
}

function buzz(e: React.MouseEvent) {
  const btn = (e.target as HTMLElement).closest("button");
  if (btn && !btn.disabled && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(12);
  }
}

/**
 * Squash-and-spring on every press, including the already-selected (disabled)
 * button, so the control always feels pushed. Web Animations restart cleanly on
 * rapid taps without re-rendering, which would swallow the form submit.
 */
function bounce(el: Element | null) {
  if (!(el instanceof HTMLElement) || typeof el.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.9)", offset: 0.3 },
      { transform: "scale(1.05)", offset: 0.65 },
      { transform: "scale(1)" },
    ],
    { duration: 320, easing: "ease-out" },
  );
}

export function AvailabilityControls({
  matchId,
  currentStatus,
  open,
  locked = false,
  msToLock = null,
  isSubscriber = false,
}: AvailabilityControlsProps) {
  const router = useRouter();
  // Flip the button the instant it's tapped; React drops the optimistic value
  // when the action finishes (server rejected → back to the real status).
  const [shownStatus, setShownStatus] = useOptimistic<AvailabilityStatus, AvailabilityStatus>(
    currentStatus,
    (_cur, next) => next,
  );
  const [state, formAction] = useActionState(
    async (prev: AvailabilityActionState, fd: FormData) => {
      setShownStatus(fd.get("status") === "in" ? "in" : "out");
      return setAvailabilityAction(prev, fd);
    },
    INITIAL,
  );
  const { onTap, puffs, smoking } = useTapSpam();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const closed = !open;
  const disabled = locked || closed;
  // One short line, only when there is something the buttons can't say.
  const note = closed
    ? "Sign-up is closed."
    : locked
      ? "Locked within 24 hours of kickoff."
      : msToLock != null && msToLock > 0 && msToLock <= LOCK_WARNING_MS
        ? `⏳ Changes close in ${formatDuration(msToLock)}.`
        : isSubscriber && shownStatus !== "out"
          ? "★ Season place: going OUT frees your spot, the fee still applies."
          : null;

  const btn = (value: "in" | "out") => {
    const selected = shownStatus === value;
    const isIn = value === "in";
    return (
      <form
        action={formAction}
        className="flex-1"
        onPointerDown={(e) => bounce(e.currentTarget.querySelector("button"))}
      >
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="status" value={value} />
        <button
          type="submit"
          disabled={disabled || selected}
          aria-pressed={selected}
          aria-describedby={disabled && (closed || locked) ? "availability-blocked-note" : undefined}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-bold transition-colors disabled:pointer-events-none ${
            selected
              ? isIn
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-red-600 text-white shadow-sm"
              : `text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white ${
                  isIn ? "hover:bg-emerald-50 dark:hover:bg-emerald-950/30" : "hover:bg-red-50 dark:hover:bg-red-950/30"
                }`
          }`}
        >
          <span key={`${value}-${shownStatus}`} className={selected ? "tap-pop" : ""}>
            {isIn ? <CheckIcon className="h-5 w-5" /> : <XIcon className="h-5 w-5" />}
          </span>
          {isIn ? "IN" : "OUT"}
        </button>
      </form>
    );
  };

  return (
    <div>
      {shownStatus === "pending" && !closed ? (
        <p className="mb-2 text-sm font-semibold">Can you play?</p>
      ) : null}
      <div
        className={`relative flex gap-1 rounded-2xl border bg-white p-1 shadow-sm dark:bg-neutral-900 ${smoking ? "tap-shake" : ""} ${
          shownStatus === "pending" && !closed
            ? "border-amber-400/60"
            : "border-black/[0.06] dark:border-white/10"
        }`}
        onClickCapture={buzz}
        // Disabled buttons let the tap through (pointer-events-none) so spam still counts.
        // Pointer-up: iOS only allows audio to start at the end of a touch.
        onPointerUp={onTap}
      >
        {btn("in")}
        {btn("out")}
        <TapSmoke puffs={puffs} smoking={smoking} />
      </div>
      {note ? (
        <p
          id={closed || locked ? "availability-blocked-note" : undefined}
          className="mt-2 px-1 text-xs text-neutral-600 dark:text-neutral-300"
        >
          {closed ? "Sign-up is closed." : note}
          {closed || locked ? (
            <MessageAdminLink
              matchId={matchId}
              reason={closed ? "I need help with the closed sign-up." : "I need to change my availability after the lock."}
            />
          ) : null}
        </p>
      ) : null}
      {!state.ok && state.message ? (
        <FeedbackMessage ok={false} message={state.message} className="mt-2" />
      ) : null}
    </div>
  );
}
