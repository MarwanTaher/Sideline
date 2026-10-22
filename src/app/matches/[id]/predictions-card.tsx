"use client";

import { useActionState, useOptimistic } from "react";
import { savePredictionAction, type PredictionActionState } from "./predictions-actions";
import type { MatchPredictionView } from "@/lib/predictions";
import { isPredictionCorrect } from "@/lib/prediction-rules";
import { kitFor } from "@/lib/field-view";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: PredictionActionState = { ok: false, message: "" };

export type PredictionTeam = { teamNo: number; label: string; color?: string };

export function PredictionsCard({
  matchId,
  teams,
  view,
  canPredict,
}: {
  matchId: number;
  teams: PredictionTeam[];
  view: MatchPredictionView;
  canPredict: boolean;
}) {
  const [shown, setShown] = useOptimistic(
    { myPick: view.myPick, total: view.total },
    (cur, next: number) => ({
      myPick: next,
      total: cur.myPick == null ? cur.total + 1 : cur.total,
    }),
  );
  const [state, formAction, pending] = useActionState(
    async (prev: PredictionActionState, fd: FormData) => {
      setShown(Number(fd.get("teamNo")));
      return savePredictionAction(prev, fd);
    },
    INITIAL,
  );

  const open = view.window === "open";
  const myPick = shown.myPick;
  const correct = view.scored && myPick != null ? isPredictionCorrect(myPick, view.winners) : null;
  const status = open
    ? `${shown.total} predicted`
    : view.scored
      ? "Final"
      : "Locked";

  return (
    <section
      aria-labelledby="predictions-title"
      className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="predictions-title" className="text-sm font-semibold">
          🔮 Who wins the day?
        </h2>
        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{status}</span>
      </div>

      {open && canPredict ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          {teams.map((t) => {
            const selected = myPick === t.teamNo;
            const kit = kitFor(t.teamNo, t.color);
            return (
              <form key={t.teamNo} action={formAction} className="sm:flex-1">
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="teamNo" value={t.teamNo} />
                <button
                  type="submit"
                  disabled={selected}
                  aria-pressed={selected}
                  className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:cursor-default ${
                    selected
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-black/10 text-neutral-700 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                    style={{ backgroundColor: kit.bg }}
                  />
                  <span className="truncate">{t.label}</span>
                </button>
              </form>
            );
          })}
        </div>
      ) : null}

      {!view.revealed ? (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {canPredict && myPick == null ? "Pick before kickoff. " : ""}
          Picks are revealed at kickoff.
          {pending ? " Saving…" : ""}
        </p>
      ) : view.total > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {teams.map((t) => {
            const count = view.distribution?.[t.teamNo] ?? 0;
            const pct = view.total > 0 ? Math.round((count / view.total) * 100) : 0;
            const won = view.scored && (view.winners?.includes(t.teamNo) ?? false);
            const kit = kitFor(t.teamNo, t.color);
            return (
              <li key={t.teamNo} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                      style={{ backgroundColor: kit.bg }}
                    />
                    <span className="truncate">{t.label}</span>
                    {won ? <span aria-label="Matchday winner">🏆</span> : null}
                    {myPick === t.teamNo ? (
                      <span className="rounded bg-neutral-100 px-1 text-[10px] font-semibold uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        You
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: kit.bg }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {correct != null ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            correct ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {correct ? "✓ Correct · +1 pundit point" : "✗ Not this time"}
        </p>
      ) : view.closed && !view.scored && view.total > 0 ? (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">No result to score.</p>
      ) : view.revealed && view.total === 0 ? (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">No predictions.</p>
      ) : null}

      {!state.ok && state.message ? (
        <FeedbackMessage ok={false} message={state.message} className="mt-2" />
      ) : null}
    </section>
  );
}
