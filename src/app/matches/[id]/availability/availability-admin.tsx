"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  adminSetAvailabilityAction,
  setAvailabilityOpenAction,
  setMaxPlayersAction,
  setWaitlistAutoPromoteAction,
  setWaitlistVisibleAction,
  adminAddToWaitlistAction,
  adminRemoveFromWaitlistAction,
  adminMoveWaitlistAction,
  setVoteGateAction,
  type AvailabilityActionState,
} from "./actions";
import type { PlayerAvailability } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: AvailabilityActionState = { ok: false, message: "" };

const STATUS_STYLE: Record<PlayerAvailability["status"], string> = {
  in: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  out: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  pending: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

/** Feature 3: open/close availability, independent of matchday status. */
export function AvailabilityOpenToggle({
  matchId,
  open,
}: {
  matchId: number;
  open: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setAvailabilityOpenAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Availability is currently{" "}
          <span className={open ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-amber-600 dark:text-amber-400"}>
            {open ? "open" : "closed"}
          </span>
          .
        </p>
        <form action={formAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="open" value={open ? "false" : "true"} />
          <Button
            type="submit"
            variant={open ? "secondary" : "success"}
            pending={pending}
            pendingLabel="Saving…"
          >
            {open ? "Close availability" : "Open availability"}
          </Button>
        </form>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}

/** Feature 2: configure the per-match cap on players who can be IN. */
export function MaxPlayersForm({
  matchId,
  maxPlayers,
}: {
  matchId: number;
  maxPlayers: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setMaxPlayersAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <label className="block text-sm">
          <span className="font-medium">Max players</span>
          <input
            type="number"
            name="maxPlayers"
            min={1}
            max={60}
            defaultValue={maxPlayers}
            className="mt-1 w-24 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          />
        </label>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Saving…">
          Save
        </Button>
      </form>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}

/** #9: waitlist controls — auto-promotion, visibility, ordering, add/remove. */
export function WaitlistToggle({
  matchId,
  enabled,
  visibleToPlayers,
  waitlist,
  candidates,
}: {
  matchId: number;
  enabled: boolean;
  visibleToPlayers: boolean;
  waitlist: { playerId: number; name: string }[];
  candidates: { playerId: number; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setWaitlistAutoPromoteAction,
    INITIAL,
  );
  const [visState, visAction, visPending] = useActionState(
    setWaitlistVisibleAction,
    INITIAL,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (visState.ok) router.refresh();
  }, [visState, router]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Waitlist auto-promotion is{" "}
          <span
            className={
              enabled
                ? "font-semibold text-emerald-600 dark:text-emerald-400"
                : "font-semibold text-neutral-500"
            }
          >
            {enabled ? "on" : "off"}
          </span>
          . When on, players who try to join a full match are waitlisted and
          promoted automatically (first-in) as spots open, with a push to
          confirm.
        </p>
        <form action={formAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <Button
            type="submit"
            variant={enabled ? "secondary" : "success"}
            pending={pending}
            pendingLabel="Saving…"
          >
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3 dark:border-white/5">
        <p className="text-xs text-neutral-500">
          Waitlist is{" "}
          <span
            className={
              visibleToPlayers
                ? "font-semibold text-emerald-600 dark:text-emerald-400"
                : "font-semibold text-neutral-500"
            }
          >
            {visibleToPlayers ? "visible" : "hidden"}
          </span>{" "}
          to players. When visible, everyone sees the ordered waitlist on this page.
        </p>
        <form action={visAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="enabled" value={visibleToPlayers ? "false" : "true"} />
          <Button
            type="submit"
            variant={visibleToPlayers ? "secondary" : "success"}
            pending={visPending}
            pendingLabel="Saving…"
          >
            {visibleToPlayers ? "Hide" : "Show"}
          </Button>
        </form>
      </div>

      <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/5">
        <h4 className="text-xs font-medium text-neutral-500">
          Waitlist ({waitlist.length})
        </h4>
        {waitlist.length > 0 ? (
          <ol className="mt-1 space-y-1">
            {waitlist.map((w, i) => (
              <li
                key={w.playerId}
                className="flex items-center gap-2 rounded-lg border border-black/10 px-2 py-1 text-sm dark:border-white/10"
              >
                <span className="w-5 text-right text-xs tabular-nums text-neutral-400">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <form action={adminMoveWaitlistAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="playerId" value={w.playerId} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={i === 0}
                    aria-label={`Move ${w.name} up`}
                    className="rounded-md border border-black/10 px-1.5 py-0.5 text-xs transition enabled:hover:bg-neutral-50 disabled:opacity-30 dark:border-white/15 dark:enabled:hover:bg-neutral-800"
                  >
                    ↑
                  </button>
                </form>
                <form action={adminMoveWaitlistAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="playerId" value={w.playerId} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === waitlist.length - 1}
                    aria-label={`Move ${w.name} down`}
                    className="rounded-md border border-black/10 px-1.5 py-0.5 text-xs transition enabled:hover:bg-neutral-50 disabled:opacity-30 dark:border-white/15 dark:enabled:hover:bg-neutral-800"
                  >
                    ↓
                  </button>
                </form>
                <form action={adminRemoveFromWaitlistAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="playerId" value={w.playerId} />
                  <button
                    type="submit"
                    aria-label={`Remove ${w.name} from waitlist`}
                    className="rounded-md border border-black/10 px-1.5 py-0.5 text-xs text-red-600 transition hover:bg-red-50 dark:border-white/15 dark:hover:bg-red-950/40"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-neutral-400">Waitlist is empty.</p>
        )}

        {candidates.length > 0 ? (
          <form
            action={adminAddToWaitlistAction}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="matchId" value={matchId} />
            <select
              name="playerId"
              defaultValue=""
              required
              className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
            >
              <option value="" disabled>
                Add a player…
              </option>
              {candidates.map((c) => (
                <option key={c.playerId} value={c.playerId}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium transition hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
            >
              Add to waitlist
            </button>
          </form>
        ) : null}
      </div>

      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
      <FeedbackMessage ok={visState.ok} message={visState.message} className="mt-2" />
    </div>
  );
}

/** Availability vote-gate: block IN until a player rates their last game. */
export function VoteGateToggle({
  matchId,
  enabled,
}: {
  matchId: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setVoteGateAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Vote-gate is{" "}
          <span
            className={
              enabled
                ? "font-semibold text-emerald-600 dark:text-emerald-400"
                : "font-semibold text-neutral-500"
            }
          >
            {enabled ? "on" : "off"}
          </span>
          . When on, a player who was in their last game but hasn&apos;t rated
          anyone yet can&apos;t mark themselves IN for a new match until they
          vote. Casting any vote clears the block; going OUT is always allowed.
        </p>
        <form action={formAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <Button
            type="submit"
            variant={enabled ? "secondary" : "success"}
            pending={pending}
            pendingLabel="Saving…"
          >
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        </form>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}

/** Feature 1: admin sets any player IN or OUT. */
export function AdminPlayerControls({
  matchId,
  players,
}: {
  matchId: number;
  players: PlayerAvailability[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(adminSetAvailabilityAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (players.length === 0) {
    return <p className="text-xs text-neutral-400">No active players.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {players.map((p) => (
          <li key={p.playerId} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <span className="truncate text-sm">{p.name}</span>
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[p.status]}`}
              >
                {p.status}
              </span>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <form action={formAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="playerId" value={p.playerId} />
                <input type="hidden" name="status" value="in" />
                <Button
                  type="submit"
                  variant="success"
                  className="px-2 py-1 text-xs"
                  disabled={p.status === "in"}
                  pending={pending}
                  pendingLabel="…"
                >
                  IN
                </Button>
              </form>
              <form action={formAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="playerId" value={p.playerId} />
                <input type="hidden" name="status" value="out" />
                <Button
                  type="submit"
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  disabled={p.status === "out"}
                  pending={pending}
                  pendingLabel="…"
                >
                  OUT
                </Button>
              </form>
              <form action={formAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="playerId" value={p.playerId} />
                <input type="hidden" name="status" value="pending" />
                <Button
                  type="submit"
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  disabled={p.status === "pending"}
                  pending={pending}
                  pendingLabel="…"
                >
                  PENDING
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}
