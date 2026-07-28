"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";
import type { MatchTeamPlayer } from "@/lib/matches";
import type { MatchdayConsole as ConsoleData, MatchRound, RoundGoal } from "@/lib/matchday";
import {
  createRoundAction,
  endRoundAction,
  deleteRoundAction,
  timerAction as timerServerAction,
  addGoalAction,
  deleteGoalAction,
  syncStatsAction,
  type MatchdayActionState,
} from "./actions";

const INITIAL: MatchdayActionState = { ok: false, message: "" };

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function personValue(p: MatchTeamPlayer): string {
  return p.isGuest ? `g:${-p.playerId}` : `p:${p.playerId}`;
}

function teamLabel(teamNo: number, names: Record<number, string>): string {
  return names[teamNo] ?? `Team ${teamNo}`;
}

/** Tracks the server/client clock skew so a running timer reads correctly. */
function useServerClock(serverNowMs: number): () => number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(serverNowMs - Date.now());
  }, [serverNowMs]);
  return () => Date.now() + offset;
}

/** A 4Hz tick to re-render running timers. */
function useTick(active: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(h);
  }, [active]);
}

// ── Main console ───────────────────────────────────────────────────────────

export function MatchdayConsole({
  matchId,
  initial,
}: {
  matchId: number;
  initial: ConsoleData;
}) {
  const { teams, teamNames, rounds, tally } = initial;
  const teamNumbers = teams.map((t) => t.teamNo);
  const rosterByTeam = useMemo(() => {
    const map = new Map<number, MatchTeamPlayer[]>();
    for (const t of teams) map.set(t.teamNo, t.players);
    return map;
  }, [teams]);

  const nowFn = useServerClock(initial.serverNowMs);
  const anyRunning = rounds.some((r) => r.running);
  useTick(anyRunning);

  const orderedRounds = [...rounds].reverse(); // newest first

  return (
    <div className="space-y-8">
      <NewRoundForm matchId={matchId} teamNumbers={teamNumbers} teamNames={teamNames} />

      {orderedRounds.length === 0 ? (
        <p className="rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
          No rounds yet. Start the first rotating game above.
        </p>
      ) : (
        <div className="space-y-5">
          {orderedRounds.map((round) => (
            <RoundCard
              key={round.id}
              matchId={matchId}
              round={round}
              teamNames={teamNames}
              rosterA={rosterByTeam.get(round.teamA) ?? []}
              rosterB={rosterByTeam.get(round.teamB) ?? []}
              nowFn={nowFn}
            />
          ))}
        </div>
      )}

      <DayTally tally={tally} matchId={matchId} />
    </div>
  );
}

// ── New round ────────────────────────────────────────────────────────────

function NewRoundForm({
  matchId,
  teamNumbers,
  teamNames,
}: {
  matchId: number;
  teamNumbers: number[];
  teamNames: Record<number, string>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createRoundAction, INITIAL);
  const [teamA, setTeamA] = useState(teamNumbers[0]);
  const [teamB, setTeamB] = useState(teamNumbers[1] ?? teamNumbers[0]);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={action}
      className="rounded-xl border border-black/10 p-4 dark:border-white/10"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="teamA" value={teamA} />
      <input type="hidden" name="teamB" value={teamB} />
      <h2 className="text-sm font-semibold">Start a round</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-500">Home</span>
          <select
            value={teamA}
            onChange={(e) => setTeamA(Number(e.target.value))}
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          >
            {teamNumbers.map((n) => (
              <option key={n} value={n}>
                {teamLabel(n, teamNames)}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-sm text-neutral-500">vs</span>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-500">Away</span>
          <select
            value={teamB}
            onChange={(e) => setTeamB(Number(e.target.value))}
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          >
            {teamNumbers.map((n) => (
              <option key={n} value={n}>
                {teamLabel(n, teamNames)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" pending={pending} pendingLabel="Starting…">
          Start round
        </Button>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} />
    </form>
  );
}

// ── Round card ─────────────────────────────────────────────────────────────

function RoundCard({
  matchId,
  round,
  teamNames,
  rosterA,
  rosterB,
  nowFn,
}: {
  matchId: number;
  round: MatchRound;
  teamNames: Record<number, string>;
  rosterA: MatchTeamPlayer[];
  rosterB: MatchTeamPlayer[];
  nowFn: () => number;
}) {
  const liveMs =
    round.running && round.startedAtMs != null
      ? round.elapsedMs + (nowFn() - round.startedAtMs)
      : round.elapsedMs;

  const isDone = round.status === "done";

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Round {round.roundNo}
            {isDone ? " · finished" : ""}
          </p>
          <p className="mt-0.5 text-lg font-semibold">
            {teamLabel(round.teamA, teamNames)}{" "}
            <span className="tabular-nums">{round.scoreA}</span>
            <span className="mx-2 text-neutral-400">–</span>
            <span className="tabular-nums">{round.scoreB}</span>{" "}
            {teamLabel(round.teamB, teamNames)}
          </p>
        </div>
        <TimerControls matchId={matchId} round={round} liveMs={liveMs} />
      </div>

      {!isDone ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <GoalPicker
            matchId={matchId}
            round={round}
            teamNo={round.teamA}
            teamName={teamLabel(round.teamA, teamNames)}
            roster={rosterA}
          />
          <GoalPicker
            matchId={matchId}
            round={round}
            teamNo={round.teamB}
            teamName={teamLabel(round.teamB, teamNames)}
            roster={rosterB}
          />
        </div>
      ) : null}

      <GoalLog matchId={matchId} goals={round.goals} teamNames={teamNames} />

      <RoundFooter matchId={matchId} round={round} />
    </div>
  );
}

function TimerControls({
  matchId,
  round,
  liveMs,
}: {
  matchId: number;
  round: MatchRound;
  liveMs: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(timerServerAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const isDone = round.status === "done";

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="roundId" value={round.id} />
      <span
        className={`min-w-[4.5rem] rounded-lg px-3 py-1.5 text-center text-xl font-semibold tabular-nums ${
          round.running
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-black/5 dark:bg-white/10"
        }`}
        aria-live="off"
      >
        {fmtClock(liveMs)}
      </span>
      {!isDone ? (
        <div className="flex items-center gap-1.5">
          {round.running ? (
            <button
              type="submit"
              name="timerAction"
              value="pause"
              disabled={pending}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
            >
              Pause
            </button>
          ) : (
            <button
              type="submit"
              name="timerAction"
              value="start"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {round.elapsedMs > 0 ? "Resume" : "Start"}
            </button>
          )}
          <button
            type="submit"
            name="timerAction"
            value="reset"
            disabled={pending}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
          >
            Reset
          </button>
        </div>
      ) : null}
    </form>
  );
}

function GoalPicker({
  matchId,
  round,
  teamNo,
  teamName,
  roster,
}: {
  matchId: number;
  round: MatchRound;
  teamNo: number;
  teamName: string;
  roster: MatchTeamPlayer[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addGoalAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [scorer, setScorer] = useState("");
  const [assist, setAssist] = useState("");

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setScorer("");
      setAssist("");
      router.refresh();
    }
  }, [state, router]);

  if (roster.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-3 text-sm text-neutral-500 dark:border-white/15">
        {teamName} has no drafted players yet.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        + Goal · {teamName}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="rounded-lg border border-black/15 p-3 dark:border-white/15"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="roundId" value={round.id} />
      <input type="hidden" name="teamNo" value={teamNo} />
      <input type="hidden" name="scorer" value={scorer} />
      <input type="hidden" name="assist" value={assist} />

      <p className="text-sm font-semibold">{teamName} — who scored?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {roster.map((p) => {
          const v = personValue(p);
          const sel = scorer === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setScorer(sel ? "" : v)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                sel
                  ? "bg-emerald-600 text-white"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm font-semibold">Assist? (optional)</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {roster.map((p) => {
          const v = personValue(p);
          const sel = assist === v;
          const isScorer = scorer === v;
          return (
            <button
              key={v}
              type="button"
              disabled={isScorer}
              onClick={() => setAssist(sel ? "" : v)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${
                sel
                  ? "bg-sky-600 text-white"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" pending={pending} pendingLabel="Saving…" disabled={scorer === ""}>
          Log goal
        </Button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setScorer("");
            setAssist("");
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} />
    </form>
  );
}

function GoalLog({
  matchId,
  goals,
  teamNames,
}: {
  matchId: number;
  goals: RoundGoal[];
  teamNames: Record<number, string>;
}) {
  if (goals.length === 0) {
    return <p className="mt-4 text-sm text-neutral-500">No goals logged yet.</p>;
  }
  return (
    <ul className="mt-4 space-y-1.5">
      {goals.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span>
            <span aria-hidden="true">⚽ </span>
            <span className="font-medium">{g.scorer.name}</span>
            {g.assist ? (
              <span className="text-neutral-500"> (assist: {g.assist.name})</span>
            ) : null}
            <span className="ml-2 text-xs text-neutral-400">
              {teamLabel(g.teamNo, teamNames)}
            </span>
          </span>
          <DeleteGoalButton matchId={matchId} goalId={g.id} />
        </li>
      ))}
    </ul>
  );
}

function DeleteGoalButton({ matchId, goalId }: { matchId: number; goalId: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteGoalAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="goalId" value={goalId} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Remove goal"
        className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
      >
        ✕
      </button>
    </form>
  );
}

function RoundFooter({ matchId, round }: { matchId: number; round: MatchRound }) {
  const router = useRouter();
  const [endState, endAction, endPending] = useActionState(endRoundAction, INITIAL);
  const [delState, delAction, delPending] = useActionState(deleteRoundAction, INITIAL);
  useEffect(() => {
    if (endState.ok || delState.ok) router.refresh();
  }, [endState, delState, router]);

  return (
    <div className="mt-4 flex items-center gap-3 border-t border-black/5 pt-3 dark:border-white/5">
      {round.status !== "done" ? (
        <form action={endAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="roundId" value={round.id} />
          <button
            type="submit"
            disabled={endPending}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
          >
            End round
          </button>
        </form>
      ) : null}
      <form action={delAction}>
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="roundId" value={round.id} />
        <button
          type="submit"
          disabled={delPending}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition hover:text-red-600 disabled:opacity-50"
        >
          Delete round
        </button>
      </form>
    </div>
  );
}

// ── Day tally + stats sync ───────────────────────────────────────────────

function DayTally({
  tally,
  matchId,
}: {
  tally: ConsoleData["tally"];
  matchId: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(syncStatsAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Today&apos;s scorers</h2>
        <form action={action} ref={formRef}>
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" pending={pending} pendingLabel="Syncing…" variant="secondary">
            Sync to match stats
          </Button>
        </form>
      </div>

      {tally.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No goals logged yet today.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-1">Player</th>
              <th className="py-1 text-right">Goals</th>
              <th className="py-1 text-right">Assists</th>
            </tr>
          </thead>
          <tbody>
            {tally.map((t) => (
              <tr key={t.key} className="border-t border-black/5 dark:border-white/5">
                <td className="py-1.5">{t.name}</td>
                <td className="py-1.5 text-right tabular-nums">{t.goals}</td>
                <td className="py-1.5 text-right tabular-nums">{t.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Syncing writes each roster player&apos;s goals and assists into this
        match&apos;s stats, feeding the leaderboard and awards. Guests appear in
        the live log but not in season stats.
      </p>
      <FeedbackMessage ok={state.ok} message={state.message} />
    </div>
  );
}
