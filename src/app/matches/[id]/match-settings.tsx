"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  updateMatchSettingsAction,
  setMatchdayStatusAction,
  setMatchStatusAction,
  deleteMatchAction,
  type MatchActionState,
} from "../actions";
import type { MatchAdmin, MatchdayStatus } from "@/lib/match-admin";
import { TEAM_COUNT_OPTIONS } from "@/lib/team-constants";
import { useEffect } from "react";

const INITIAL: MatchActionState = { ok: false, message: "" };

/** Convert stored "hh:mm am/pm" back to 24h "HH:MM" for the <input type="time">. */
function to24h(value: string): string {
  const m = String(value ?? "").trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!m) return "21:00";
  let h = Number(m[1]) % 12;
  if (m[3] === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const MATCHDAY_OPTS: { key: MatchdayStatus; label: string }[] = [
  { key: "draft", label: "🟡 Draft" },
  { key: "active", label: "🟢 Active" },
  { key: "closed", label: "🔴 Closed" },
];

function StatusBanner({ state }: { state: MatchActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        state.ok
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      {state.message}
    </p>
  );
}

export function MatchSettings({ match }: { match: MatchAdmin }) {
  const router = useRouter();

  const [mdState, mdAction, mdPending] = useActionState(setMatchdayStatusAction, INITIAL);
  const [stState, stAction, stPending] = useActionState(setMatchStatusAction, INITIAL);
  const [editState, editAction, editPending] = useActionState(
    updateMatchSettingsAction,
    INITIAL,
  );
  const [delState, delAction, delPending] = useActionState(deleteMatchAction, INITIAL);

  useEffect(() => {
    if (mdState.ok || stState.ok || editState.ok) router.refresh();
  }, [mdState, stState, editState, router]);

  return (
    <section className="mt-10 rounded-xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-lg font-semibold tracking-tight">Match settings</h2>
      <p className="mt-1 text-xs text-neutral-500">Admin only.</p>

      {/* Matchday lifecycle */}
      <div className="mt-4">
        <h3 className="text-sm font-medium">Matchday status</h3>
        <p className="text-xs text-neutral-500">
          draft → active → closed. Only one match can be active at a time.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MATCHDAY_OPTS.map((opt) => (
            <form key={opt.key} action={mdAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="matchdayStatus" value={opt.key} />
              <button
                type="submit"
                disabled={mdPending || match.matchdayStatus === opt.key}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-100 ${
                  match.matchdayStatus === opt.key
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-black/15 hover:bg-neutral-50 disabled:opacity-40 dark:border-white/15 dark:hover:bg-neutral-800"
                }`}
              >
                {opt.label}
              </button>
            </form>
          ))}
        </div>
        <StatusBanner state={mdState} />
      </div>

      {/* Submissions status (open/closed) */}
      <div className="mt-6">
        <h3 className="text-sm font-medium">Player submissions</h3>
        <p className="text-xs text-neutral-500">
          Currently {match.status === "open" ? "open" : "closed"}.
        </p>
        <form action={stAction} className="mt-2">
          <input type="hidden" name="matchId" value={match.id} />
          <input
            type="hidden"
            name="status"
            value={match.status === "open" ? "closed" : "open"}
          />
          <button
            type="submit"
            disabled={stPending}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-40 dark:border-white/15 dark:hover:bg-neutral-800"
          >
            {match.status === "open" ? "Close submissions" : "Open submissions"}
          </button>
        </form>
        <StatusBanner state={stState} />
      </div>

      {/* Edit core fields */}
      <div className="mt-6">
        <h3 className="text-sm font-medium">Details</h3>
        <form action={editAction} className="mt-2 space-y-3">
          <input type="hidden" name="matchId" value={match.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium">Match day</span>
              <input
                type="date"
                name="playedOn"
                defaultValue={match.playedOn}
                required
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Match time</span>
              <input
                type="time"
                name="matchTime"
                defaultValue={to24h(match.matchTime)}
                required
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Number of teams</span>
              <select
                name="numTeams"
                defaultValue={String(match.numTeams)}
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="statsScoringEnabled"
              defaultChecked={match.statsScoringEnabled}
              className="h-4 w-4"
            />
            <span>Include stats in scoring</span>
          </label>
          <button
            type="submit"
            disabled={editPending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {editPending ? "Saving…" : "Save details"}
          </button>
        </form>
        <StatusBanner state={editState} />
      </div>

      {/* Danger zone */}
      <div className="mt-6 rounded-lg border border-red-500/30 bg-red-50/40 p-4 dark:bg-red-950/20">
        <h3 className="text-sm font-medium text-red-700 dark:text-red-300">Danger zone</h3>
        <p className="text-xs text-red-700/80 dark:text-red-300/80">
          Deleting a match permanently removes its roster, availability, votes, stats and payments.
          Type <span className="font-mono font-semibold">DELETE</span> to confirm.
        </p>
        <form action={delAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="matchId" value={match.id} />
          <input
            type="text"
            name="confirm"
            placeholder="DELETE"
            autoComplete="off"
            className="rounded-lg border border-red-500/40 bg-white px-3 py-2 text-sm dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={delPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
          >
            {delPending ? "Deleting…" : "Delete match"}
          </button>
        </form>
        <StatusBanner state={delState} />
      </div>
    </section>
  );
}
