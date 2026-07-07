"use client";

import { useEffect, useRef, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  addGuestAction,
  removeGuestAction,
  type GuestActionState,
} from "@/app/actions/guests";
import { SKILL_LEVELS, MAX_GUESTS_PER_HOST, type Guest } from "@/lib/guests";
import { POSITIONS } from "@/lib/positions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: GuestActionState = { ok: false, message: "" };

export interface AddGuestFormProps {
  matchId: number;
  /** When set, the guest is added on behalf of this host (admin flow). */
  hostPlayerId?: number;
  /** Remaining guest slots for the host. */
  remaining: number;
  open: boolean;
}

export function AddGuestForm({ matchId, hostPlayerId, remaining, open }: AddGuestFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(addGuestAction, INITIAL);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  if (!open) {
    return (
      <p className="text-sm text-neutral-500">
        Guests can no longer be added — availability is closed.
      </p>
    );
  }

  if (remaining <= 0) {
    return (
      <p className="text-sm text-neutral-500">
        You have reached the limit of {MAX_GUESTS_PER_HOST} guests.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="matchId" value={matchId} />
      {hostPlayerId != null ? (
        <input type="hidden" name="hostPlayerId" value={hostPlayerId} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-1">
          <span className="mb-1 block text-neutral-500">Guest name</span>
          <input
            type="text"
            name="name"
            required
            maxLength={60}
            placeholder="Full name"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </label>
        <label className="text-sm sm:col-span-1">
          <span className="mb-1 block text-neutral-500">Position (optional)</span>
          <select
            name="position"
            defaultValue=""
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          >
            <option value="">Any</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-1">
          <span className="mb-1 block text-neutral-500">Skill (optional)</span>
          <select
            name="skill"
            defaultValue=""
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          >
            <option value="">Below average (default)</option>
            {SKILL_LEVELS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" pending={pending} pendingLabel="Adding…">
          Add guest
        </Button>
        <span className="text-xs text-neutral-500">
          {remaining} of {MAX_GUESTS_PER_HOST} slots left
        </span>
      </div>

      <FeedbackMessage ok={state.ok} message={state.message} />
    </form>
  );
}

export interface GuestListProps {
  matchId: number;
  guests: Guest[];
  /** Show the host's name next to each guest (admin overview). */
  showHost?: boolean;
  /** Whether the current viewer may remove these guests. */
  canRemove: boolean;
}

export function GuestList({ matchId, guests, showHost, canRemove }: GuestListProps) {
  if (guests.length === 0) {
    return <p className="text-sm text-neutral-500">No guests yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {guests.map((g) => (
        <GuestRow
          key={g.id}
          matchId={matchId}
          guest={g}
          showHost={showHost}
          canRemove={canRemove}
        />
      ))}
    </ul>
  );
}

function GuestRow({
  matchId,
  guest,
  showHost,
  canRemove,
}: {
  matchId: number;
  guest: Guest;
  showHost?: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(removeGuestAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10">
      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
        Guest
      </span>
      <span className="flex-1 truncate font-medium">
        {guest.name}
        {showHost ? (
          <span className="font-normal text-neutral-500"> · host: {guest.hostName}</span>
        ) : null}
      </span>
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {guest.position}
      </span>
      {canRemove ? (
        <form action={formAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="guestId" value={guest.id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-red-600 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {pending ? "…" : "Remove"}
          </button>
        </form>
      ) : null}
    </li>
  );
}
