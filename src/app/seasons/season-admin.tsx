"use client";

import { useActionState } from "react";
import type { Season } from "@/lib/seasons";
import { createSeasonAction, archiveSeasonAction, type SeasonActionState } from "./actions";

const INITIAL: SeasonActionState = { ok: false, message: "" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SeasonAdmin({ activeSeason }: { activeSeason: Season | null }) {
  const [createState, createAction, creating] = useActionState(createSeasonAction, INITIAL);
  const [archiveState, archiveAction, archiving] = useActionState(archiveSeasonAction, INITIAL);

  return (
    <div className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Season admin</h2>

      <form action={createAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Name</span>
          <input
            name="name"
            required
            placeholder="Winter 2026"
            className="mt-1 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Start date</span>
          <input
            name="startDate"
            type="date"
            required
            defaultValue={todayIso()}
            className="mt-1 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Reset</span>
          <select
            name="resetMode"
            defaultValue="soft"
            className="mt-1 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
          >
            <option value="soft">Soft (keep all-time rating)</option>
            <option value="hard">Hard (fresh table)</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {creating ? "Starting…" : "Start new season"}
        </button>
      </form>
      <p className="mt-1 text-xs text-neutral-400">
        Starting a season archives the current one. New matches are tagged automatically.
      </p>
      {createState.message ? (
        <p className={`mt-2 text-sm ${createState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {createState.message}
        </p>
      ) : null}

      {activeSeason ? (
        <form action={archiveAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-black/5 pt-4 dark:border-white/10">
          <input type="hidden" name="seasonId" value={activeSeason.id} />
          <span className="text-sm text-neutral-500">
            Archive <strong>{activeSeason.name}</strong>
          </span>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500">End date</span>
            <input
              name="endDate"
              type="date"
              required
              defaultValue={todayIso()}
              className="mt-1 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
            />
          </label>
          <button
            type="submit"
            disabled={archiving}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-50 dark:border-white/15 dark:hover:bg-neutral-900"
          >
            {archiving ? "Archiving…" : "Archive season"}
          </button>
          {archiveState.message ? (
            <span className={`text-sm ${archiveState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {archiveState.message}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
