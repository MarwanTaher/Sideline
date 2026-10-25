"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createMatchAction, type MatchActionState } from "../actions";
import { LocationPicker } from "../location-picker";
import { TEAM_COUNT_OPTIONS } from "@/lib/team-constants";

const INITIAL: MatchActionState = { ok: false, message: "" };

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CreateMatchForm({
  season,
}: {
  season: { id: number; name: string } | null;
}) {
  const [state, formAction, pending] = useActionState(createMatchAction, INITIAL);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {season ? (
        <fieldset className="rounded-xl border border-black/10 p-3 dark:border-white/10">
          <legend className="px-1 text-sm font-medium">Match type</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="seasonMatch"
              value="yes"
              defaultChecked
              className="mt-1 h-4 w-4"
            />
            <span>
              Season match — {season.name}
              <span className="block text-xs text-neutral-500">
                Core subscribers are marked IN automatically, and non-core
                players are charged the session rate.
              </span>
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" name="seasonMatch" value="no" className="mt-1 h-4 w-4" />
            <span>
              Normal match
              <span className="block text-xs text-neutral-500">
                Availability and payments work the usual way, with no
                subscription rules.
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Match day</span>
          <input
            type="date"
            name="playedOn"
            defaultValue={todayIso()}
            required
            className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Match time</span>
          <input
            type="time"
            name="matchTime"
            defaultValue="21:00"
            required
            className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Number of teams</span>
          <select
            name="numTeams"
            defaultValue="2"
            className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          >
            {TEAM_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <LocationPicker />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="statsScoringEnabled" className="h-4 w-4" />
        <span>
          Include stats in scoring
          <span className="block text-xs text-neutral-500">
            When off, player scores for this match are based solely on peer votes.
          </span>
        </span>
      </label>

      {state.message ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? "Creating…" : "Create match"}
        </button>
        <Link
          href="/matches"
          className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
