"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Season } from "@/lib/seasons";
import {
  saveSeasonAction,
  setSeasonStatusAction,
  deleteSeasonAction,
  type SeasonActionState,
} from "./season-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: SeasonActionState = { ok: false, message: "" };

const inputCls =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export default function SeasonsAdmin({ seasons }: { seasons: Season[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [state, formAction, pending] = useActionState(saveSeasonAction, INITIAL);

  // A successful save clears the form via the key reset below, so only the
  // refresh belongs here.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const editing = editingId == null ? null : (seasons.find((s) => s.id === editingId) ?? null);

  return (
    <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Seasons</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Seasons scope the leaderboard so a long-standing leader isn&apos;t
        uncatchable. A match belongs to a season by its date, so there is nothing
        to assign by hand.
      </p>

      <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="id" value={editing?.id ?? ""} />
        <label className="sm:col-span-2">
          <span className="text-xs text-neutral-500">Name</span>
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={editing?.name ?? ""}
            key={`name-${editing?.id ?? "new"}`}
            placeholder="Autumn 2026"
            className={inputCls}
          />
        </label>
        <label>
          <span className="text-xs text-neutral-500">Starts</span>
          <input
            name="startDate"
            type="date"
            required
            defaultValue={editing?.startDate ?? ""}
            key={`start-${editing?.id ?? "new"}`}
            className={inputCls}
          />
        </label>
        <label>
          <span className="text-xs text-neutral-500">Ends (optional)</span>
          <input
            name="endDate"
            type="date"
            defaultValue={editing?.endDate ?? ""}
            key={`end-${editing?.id ?? "new"}`}
            className={inputCls}
          />
        </label>
        <div className="flex items-center gap-2 sm:col-span-4">
          <Button type="submit" pending={pending} pendingLabel="Saving…">
            {editing ? "Save season" : "Add season"}
          </Button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-sm text-neutral-500 underline underline-offset-2"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />

      {seasons.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">No seasons yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5 dark:divide-white/10">
          {seasons.map((s) => (
            <SeasonRow key={s.id} season={s} onEdit={() => setEditingId(s.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SeasonRow({ season, onEdit }: { season: Season; onEdit: () => void }) {
  const router = useRouter();
  const [statusState, statusAction, statusPending] = useActionState(
    setSeasonStatusAction,
    INITIAL,
  );
  const [delState, delAction, delPending] = useActionState(deleteSeasonAction, INITIAL);

  useEffect(() => {
    if (statusState.ok || delState.ok) router.refresh();
  }, [statusState, delState, router]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium">
          {season.name}
          {season.status === "archived" ? (
            <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              archived
            </span>
          ) : null}
        </p>
        <p className="text-xs text-neutral-500">
          {season.startDate} → {season.endDate ?? "ongoing"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium transition hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
        >
          Edit
        </button>
        <form action={statusAction}>
          <input type="hidden" name="id" value={season.id} />
          <input
            type="hidden"
            name="archived"
            value={season.status === "archived" ? "false" : "true"}
          />
          <Button
            type="submit"
            variant="secondary"
            pending={statusPending}
            pendingLabel="…"
          >
            {season.status === "archived" ? "Reopen" : "Archive"}
          </Button>
        </form>
        <form action={delAction}>
          <input type="hidden" name="id" value={season.id} />
          <Button type="submit" variant="danger" pending={delPending} pendingLabel="…">
            Delete
          </Button>
        </form>
      </div>
    </li>
  );
}
