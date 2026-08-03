"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  adminSetAvailabilityAction,
  setAvailabilityOpenAction,
  setMaxPlayersAction,
  setWaitlistAutoPromoteAction,
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

/** #9: global waitlist auto-promotion toggle + current waitlist. */
export function WaitlistToggle({
  matchId,
  enabled,
  waitlist,
}: {
  matchId: number;
  enabled: boolean;
  waitlist: { playerId: number; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setWaitlistAutoPromoteAction,
    INITIAL,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

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
      {waitlist.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-xs font-medium text-neutral-500">
            Waitlist ({waitlist.length})
          </h4>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
            {waitlist.map((w) => (
              <li key={w.playerId}>{w.name}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">Waitlist is empty.</p>
      )}
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
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
