"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  adminSetAvailabilityAction,
  nudgePendingAction,
  setAvailabilityOpenAction,
  type AvailabilityActionState,
} from "./actions";
import { Avatar } from "@/components/ui/avatar";

const INITIAL: AvailabilityActionState = { ok: false, message: "" };

function ago(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

/**
 * Sticky admin action bar for the availability page: the three things an admin
 * actually does here (nudge no-replies, open/close sign-up, go to draft) one tap
 * away instead of buried in collapsibles.
 */
export function AdminActionBar({
  matchId,
  open,
  pendingCount,
  pendingGuestCount,
  squadReady,
  lastNudgeAt,
  nudgeCooldownMs,
  nowMs,
}: {
  matchId: number;
  open: boolean;
  pendingCount: number;
  pendingGuestCount: number;
  squadReady: boolean;
  lastNudgeAt: number | null;
  nudgeCooldownMs: number;
  nowMs: number;
}) {
  const router = useRouter();
  const [nudgeState, nudgeAction, nudging] = useActionState(nudgePendingAction, INITIAL);
  const [openState, openAction, toggling] = useActionState(setAvailabilityOpenAction, INITIAL);

  useEffect(() => {
    if (nudgeState.ok || openState.ok) router.refresh();
  }, [nudgeState, openState, router]);

  const coolingDown = lastNudgeAt != null && nowMs - lastNudgeAt < nudgeCooldownMs;
  const canNudge = open && pendingCount > 0 && !coolingDown;
  const message = nudgeState.message || openState.message;
  const ok = nudgeState.message ? nudgeState.ok : openState.ok;

  const chip =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-50 disabled:active:scale-100";

  return (
    <div className="sticky top-2 z-20 mt-4 rounded-2xl border border-emerald-500/25 bg-white/95 p-2 shadow-md backdrop-blur dark:bg-neutral-900/95">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 px-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Admin
        </span>
        <form action={nudgeAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <button
            type="submit"
            disabled={!canNudge || nudging}
            className={`${chip} bg-amber-500 text-white hover:bg-amber-400`}
            title={coolingDown && lastNudgeAt ? `Nudged ${ago(nowMs - lastNudgeAt)}` : undefined}
          >
            🔔 {nudging ? "Sending…" : `Nudge ${pendingCount}`}
          </button>
        </form>
        <form action={openAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="open" value={open ? "false" : "true"} />
          <button
            type="submit"
            disabled={toggling}
            className={`${chip} border border-black/10 text-neutral-700 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-neutral-800`}
          >
            {open ? "🔒 Close sign-up" : "🔓 Open sign-up"}
          </button>
        </form>
        {pendingGuestCount > 0 ? (
          <a
            href="#guest-requests"
            className={`${chip} bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300`}
          >
            {pendingGuestCount} guest{pendingGuestCount === 1 ? "" : "s"} to approve
          </a>
        ) : null}
        <Link
          href={`/matches/${matchId}/draft`}
          className={`${chip} ml-auto ${
            squadReady
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "border border-black/10 text-neutral-600 dark:border-white/15 dark:text-neutral-300"
          }`}
        >
          Draft →
        </Link>
      </div>
      {message ? (
        <p className={`mt-1.5 px-1.5 text-xs ${ok ? "text-emerald-600" : "text-red-600"}`}>{message}</p>
      ) : lastNudgeAt != null ? (
        <p className="mt-1 px-1.5 text-[10px] text-neutral-400">Last nudge {ago(nowMs - lastNudgeAt)}</p>
      ) : null}
    </div>
  );
}

type SheetPlayer = {
  playerId: number;
  name: string;
  photoUrl?: string | null;
  status: "in" | "out" | "pending";
};

/**
 * Wraps a player face/chip. For admins, tapping opens a bottom sheet to set the
 * player IN / OUT / no reply right there — no hunting in a separate list.
 */
export function AdminPlayerTap({
  matchId,
  player,
  className,
  children,
}: {
  matchId: number;
  player: SheetPlayer;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: AvailabilityActionState, fd: FormData) => {
      const res = await adminSetAvailabilityAction(prev, fd);
      if (res.ok) {
        setShow(false);
        router.refresh();
      }
      return res;
    },
    INITIAL,
  );

  const opt = (status: SheetPlayer["status"], label: string, cls: string) => (
    <form action={formAction} className="flex-1">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="playerId" value={player.playerId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending || player.status === status}
        className={`w-full rounded-xl px-3 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${cls}`}
      >
        {label}
      </button>
    </form>
  );

  return (
    <>
      <button type="button" onClick={() => setShow(true)} className={className}>
        {children}
      </button>
      {show ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Set ${player.name}`}>
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setShow(false)}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-black/10 bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:border-white/10 dark:bg-neutral-950">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <div className="flex items-center gap-3">
              <Avatar name={player.name} photoUrl={player.photoUrl ?? null} size="md" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{player.name}</p>
                <p className="text-xs text-neutral-500">
                  Currently{" "}
                  <span className="font-semibold uppercase">
                    {player.status === "pending" ? "no reply" : player.status}
                  </span>
                </p>
              </div>
              <Link
                href={`/players/${player.playerId}`}
                className="ml-auto text-xs font-medium text-emerald-600 hover:underline"
              >
                Profile →
              </Link>
            </div>
            <div className="mt-4 flex gap-2">
              {opt("in", "IN", "bg-emerald-600 text-white hover:bg-emerald-500")}
              {opt("out", "OUT", "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300")}
              {opt(
                "pending",
                "No reply",
                "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200",
              )}
            </div>
            {state.message && !state.ok ? (
              <p className="mt-2 text-xs text-red-600">{state.message}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
