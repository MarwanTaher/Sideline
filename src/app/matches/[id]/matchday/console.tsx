"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import type { MatchTeamPlayer } from "@/lib/matches";
import type {
  MatchdayConsole as ConsoleData,
  MatchRound,
  RoundGoal,
  PersonRef,
  DayTally as DayTallyRow,
} from "@/lib/matchday";
import {
  createRoundAction,
  endRoundAction,
  deleteRoundAction,
  timerAction as timerServerAction,
  addGoalAction,
  deleteGoalAction,
  syncStatsAction,
} from "./actions";

// ── Team themes (graphics) ──────────────────────────────────────────────────

interface Theme {
  dot: string;
  soft: string;
  text: string;
  solid: string;
  ring: string;
}
const THEMES: Theme[] = [
  { dot: "bg-rose-500", soft: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", solid: "bg-rose-600 hover:bg-rose-700 active:bg-rose-800", ring: "ring-rose-500/40" },
  { dot: "bg-sky-500", soft: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", solid: "bg-sky-600 hover:bg-sky-700 active:bg-sky-800", ring: "ring-sky-500/40" },
  { dot: "bg-emerald-500", soft: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", solid: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800", ring: "ring-emerald-500/40" },
  { dot: "bg-amber-500", soft: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", solid: "bg-amber-600 hover:bg-amber-700 active:bg-amber-800", ring: "ring-amber-500/40" },
];
function themeFor(teamNo: number): Theme {
  return THEMES[(Math.abs(teamNo) - 1) % THEMES.length] ?? THEMES[0];
}

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
function refFromPlayer(p: MatchTeamPlayer): PersonRef {
  return {
    playerId: p.isGuest ? null : p.playerId,
    guestId: p.isGuest ? -p.playerId : null,
    name: p.name,
  };
}
function keyOfRef(ref: PersonRef): string {
  return ref.playerId != null ? `p:${ref.playerId}` : `g:${ref.guestId}`;
}
function teamLabel(teamNo: number, names: Record<number, string>): string {
  return names[teamNo] ?? `Team ${teamNo}`;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}
function recomputeScore(r: MatchRound): MatchRound {
  let scoreA = 0;
  let scoreB = 0;
  for (const g of r.goals) {
    if (g.teamNo === r.teamA) scoreA += 1;
    else if (g.teamNo === r.teamB) scoreB += 1;
  }
  return { ...r, scoreA, scoreB };
}

/** Server/client clock-skew corrected "now" in the server epoch. */
function useServerNow(serverNowMs: number): () => number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(serverNowMs - Date.now());
  }, [serverNowMs]);
  return useCallback(() => Date.now() + offset, [offset]);
}
function useTick(active: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(h);
  }, [active]);
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({
  name,
  photoUrl,
  theme,
  className = "h-9 w-9",
}: {
  name: string;
  photoUrl?: string | null;
  theme: Theme;
  className?: string;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photoUrl}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10`}
      />
    );
  }
  return (
    <span
      className={`${className} ${theme.soft} ${theme.text} inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-black/5 dark:ring-white/10`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function PitchBackdrop() {
  return (
    <svg
      viewBox="0 0 300 120"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="296" height="116" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="150" y1="2" x2="150" y2="118" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="150" cy="60" r="20" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="35" width="34" height="50" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="264" y="35" width="34" height="50" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ── Main console ───────────────────────────────────────────────────────────

export function MatchdayConsole({
  matchId,
  initial,
}: {
  matchId: number;
  initial: ConsoleData;
}) {
  const { teams, teamNames } = initial;
  const teamNumbers = teams.map((t) => t.teamNo);

  const [rounds, setRounds] = useState<MatchRound[]>(initial.rounds);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const rosterByTeam = useMemo(() => {
    const map = new Map<number, MatchTeamPlayer[]>();
    for (const t of teams) map.set(t.teamNo, t.players);
    return map;
  }, [teams]);

  const photoIndex = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of teams) for (const p of t.players) map.set(personValue(p), p.photoUrl ?? null);
    return map;
  }, [teams]);
  const photoOf = useCallback(
    (ref: PersonRef) => photoIndex.get(keyOfRef(ref)) ?? null,
    [photoIndex],
  );

  const nowFn = useServerNow(initial.serverNowMs);
  const anyRunning = rounds.some((r) => r.running);
  useTick(anyRunning);

  const run = useCallback(
    (fn: () => Promise<{ ok: boolean; message: string }>, onFail?: () => void) => {
      startTransition(async () => {
        try {
          const res = await fn();
          if (!res.ok) {
            setError(res.message || "Something went wrong.");
            onFail?.();
          }
        } catch {
          setError("Network error — please retry.");
          onFail?.();
        }
      });
    },
    [],
  );

  // ── Handlers (optimistic; server persists in the background) ──
  const handleCreateRound = useCallback(
    (teamA: number, teamB: number) => {
      if (teamA === teamB) {
        setError("Pick two different teams.");
        return;
      }
      setError("");
      const tempId = -Date.now();
      const nextNo = (rounds.reduce((m, r) => Math.max(m, r.roundNo), 0) || 0) + 1;
      const temp: MatchRound = {
        id: tempId, roundNo: nextNo, teamA, teamB, status: "active",
        scoreA: 0, scoreB: 0, goals: [], elapsedMs: 0, running: false, startedAtMs: null,
      };
      setRounds((prev) => [...prev, temp]);
      run(
        async () => {
          const res = await createRoundAction(matchId, teamA, teamB);
          if (res.ok && res.round) {
            const real = res.round;
            setRounds((prev) =>
              prev.map((r) => (r.id === tempId ? { ...r, id: real.id, roundNo: real.roundNo } : r)),
            );
          }
          return res;
        },
        () => setRounds((prev) => prev.filter((r) => r.id !== tempId)),
      );
    },
    [matchId, rounds, run],
  );

  const handleTimer = useCallback(
    (roundId: number, action: "start" | "pause" | "reset") => {
      const now = nowFn();
      setRounds((prev) =>
        prev.map((r) => {
          if (r.id !== roundId) return r;
          if (action === "start") {
            if (r.running) return r;
            return { ...r, running: true, startedAtMs: now };
          }
          if (action === "pause") {
            if (!r.running) return r;
            const acc = r.elapsedMs + (r.startedAtMs != null ? now - r.startedAtMs : 0);
            return { ...r, running: false, startedAtMs: null, elapsedMs: acc };
          }
          return { ...r, running: false, startedAtMs: null, elapsedMs: 0 };
        }),
      );
      if (roundId > 0) run(() => timerServerAction(matchId, roundId, action));
    },
    [matchId, nowFn, run],
  );

  const handleAddGoal = useCallback(
    (round: MatchRound, teamNo: number, scorer: MatchTeamPlayer, assist: MatchTeamPlayer | null) => {
      setError("");
      const tempId = -Date.now();
      const sref = refFromPlayer(scorer);
      const aref = assist ? refFromPlayer(assist) : null;
      const goal: RoundGoal = {
        id: tempId, roundId: round.id, teamNo, scorer: sref, assist: aref,
        createdAt: new Date().toISOString(),
      };
      setRounds((prev) =>
        prev.map((r) => (r.id === round.id ? recomputeScore({ ...r, goals: [...r.goals, goal] }) : r)),
      );
      run(
        async () => {
          const res = await addGoalAction({
            matchId, roundId: round.id, teamNo,
            scorerPlayerId: sref.playerId, scorerGuestId: sref.guestId,
            assistPlayerId: aref?.playerId ?? null, assistGuestId: aref?.guestId ?? null,
          });
          if (res.ok && res.goalId) {
            const realId = res.goalId;
            setRounds((prev) =>
              prev.map((r) =>
                r.id === round.id
                  ? { ...r, goals: r.goals.map((g) => (g.id === tempId ? { ...g, id: realId } : g)) }
                  : r,
              ),
            );
          }
          return res;
        },
        () =>
          setRounds((prev) =>
            prev.map((r) =>
              r.id === round.id ? recomputeScore({ ...r, goals: r.goals.filter((g) => g.id !== tempId) }) : r,
            ),
          ),
      );
    },
    [matchId, run],
  );

  const handleDeleteGoal = useCallback(
    (roundId: number, goalId: number) => {
      setRounds((prev) =>
        prev.map((r) => (r.id === roundId ? recomputeScore({ ...r, goals: r.goals.filter((g) => g.id !== goalId) }) : r)),
      );
      if (goalId > 0) run(() => deleteGoalAction(matchId, goalId));
    },
    [matchId, run],
  );

  const handleEndRound = useCallback(
    (roundId: number) => {
      const now = nowFn();
      setRounds((prev) =>
        prev.map((r) => {
          if (r.id !== roundId) return r;
          const acc = r.elapsedMs + (r.running && r.startedAtMs != null ? now - r.startedAtMs : 0);
          return { ...r, status: "done", running: false, startedAtMs: null, elapsedMs: acc };
        }),
      );
      if (roundId > 0) run(() => endRoundAction(matchId, roundId));
    },
    [matchId, nowFn, run],
  );

  const handleDeleteRound = useCallback(
    (roundId: number) => {
      setRounds((prev) => prev.filter((r) => r.id !== roundId));
      if (roundId > 0) run(() => deleteRoundAction(matchId, roundId));
    },
    [matchId, run],
  );

  const tally = useMemo(() => deriveTally(rounds), [rounds]);
  const orderedRounds = [...rounds].reverse();

  return (
    <div className="space-y-6">
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-lg leading-none" aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      <NewRoundBar teamNumbers={teamNumbers} teamNames={teamNames} onStart={handleCreateRound} />

      {orderedRounds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
          No rounds yet. Tap <span className="font-semibold">Start round</span> to kick off the first game.
        </p>
      ) : (
        <div className="space-y-5">
          {orderedRounds.map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              teamNames={teamNames}
              rosterA={rosterByTeam.get(round.teamA) ?? []}
              rosterB={rosterByTeam.get(round.teamB) ?? []}
              nowFn={nowFn}
              photoOf={photoOf}
              onTimer={handleTimer}
              onAddGoal={handleAddGoal}
              onDeleteGoal={handleDeleteGoal}
              onEndRound={handleEndRound}
              onDeleteRound={handleDeleteRound}
            />
          ))}
        </div>
      )}

      <DayTally tally={tally} matchId={matchId} photoOf={photoOf} onError={setError} />
    </div>
  );
}

function deriveTally(rounds: MatchRound[]): DayTallyRow[] {
  const map = new Map<string, DayTallyRow>();
  for (const r of rounds) {
    for (const g of r.goals) {
      const sk = keyOfRef(g.scorer);
      const s = map.get(sk) ?? { key: sk, name: g.scorer.name, goals: 0, assists: 0 };
      s.goals += 1;
      map.set(sk, s);
      if (g.assist) {
        const ak = keyOfRef(g.assist);
        const a = map.get(ak) ?? { key: ak, name: g.assist.name, goals: 0, assists: 0 };
        a.assists += 1;
        map.set(ak, a);
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name),
  );
}

// ── New round bar ─────────────────────────────────────────────────────────

function NewRoundBar({
  teamNumbers,
  teamNames,
  onStart,
}: {
  teamNumbers: number[];
  teamNames: Record<number, string>;
  onStart: (a: number, b: number) => void;
}) {
  const [teamA, setTeamA] = useState(teamNumbers[0]);
  const [teamB, setTeamB] = useState(teamNumbers[1] ?? teamNumbers[0]);
  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-neutral-500">Home</span>
          <select
            value={teamA}
            onChange={(e) => setTeamA(Number(e.target.value))}
            className="w-full rounded-xl border border-black/15 bg-transparent px-3 py-3 text-base dark:border-white/15"
          >
            {teamNumbers.map((n) => (
              <option key={n} value={n}>
                {teamLabel(n, teamNames)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-neutral-500">Away</span>
          <select
            value={teamB}
            onChange={(e) => setTeamB(Number(e.target.value))}
            className="w-full rounded-xl border border-black/15 bg-transparent px-3 py-3 text-base dark:border-white/15"
          >
            {teamNumbers.map((n) => (
              <option key={n} value={n}>
                {teamLabel(n, teamNames)}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => onStart(teamA, teamB)}
          className="rounded-xl bg-neutral-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-neutral-700 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Start round
        </button>
      </div>
    </div>
  );
}

// ── Round card ─────────────────────────────────────────────────────────────

function RoundCard({
  round,
  teamNames,
  rosterA,
  rosterB,
  nowFn,
  photoOf,
  onTimer,
  onAddGoal,
  onDeleteGoal,
  onEndRound,
  onDeleteRound,
}: {
  round: MatchRound;
  teamNames: Record<number, string>;
  rosterA: MatchTeamPlayer[];
  rosterB: MatchTeamPlayer[];
  nowFn: () => number;
  photoOf: (ref: PersonRef) => string | null;
  onTimer: (roundId: number, a: "start" | "pause" | "reset") => void;
  onAddGoal: (round: MatchRound, teamNo: number, scorer: MatchTeamPlayer, assist: MatchTeamPlayer | null) => void;
  onDeleteGoal: (roundId: number, goalId: number) => void;
  onEndRound: (roundId: number) => void;
  onDeleteRound: (roundId: number) => void;
}) {
  const themeA = themeFor(round.teamA);
  const themeB = themeFor(round.teamB);
  const isDone = round.status === "done";
  const liveMs =
    round.running && round.startedAtMs != null ? round.elapsedMs + (nowFn() - round.startedAtMs) : round.elapsedMs;

  const [picker, setPicker] = useState<number | null>(null); // teamNo whose picker is open

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 shadow-sm dark:border-white/10">
      {/* Scoreboard */}
      <div className="relative bg-neutral-900 px-4 py-5 text-white">
        <div className="absolute inset-0 text-white">
          <PitchBackdrop />
        </div>
        <div className="relative">
          <p className="text-center text-[11px] uppercase tracking-widest text-white/60">
            Round {round.roundNo}
            {isDone ? " · finished" : round.running ? " · live" : ""}
          </p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <div className="flex-1 text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate text-sm font-semibold sm:text-base">{teamLabel(round.teamA, teamNames)}</span>
                <span className={`h-3 w-3 rounded-full ${themeA.dot}`} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-4xl font-black tabular-nums sm:text-5xl">
              <span>{round.scoreA}</span>
              <span className="text-white/40">:</span>
              <span>{round.scoreB}</span>
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${themeB.dot}`} />
                <span className="truncate text-sm font-semibold sm:text-base">{teamLabel(round.teamB, teamNames)}</span>
              </div>
            </div>
          </div>

          {/* Timer */}
          <div className="mt-4 flex flex-col items-center gap-3">
            <div
              className={`rounded-2xl px-6 py-2 text-5xl font-black tabular-nums sm:text-6xl ${
                round.running ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white"
              }`}
            >
              {fmtClock(liveMs)}
            </div>
            {!isDone ? (
              <div className="flex w-full max-w-md items-center gap-2">
                {round.running ? (
                  <TimerBtn className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700" onClick={() => onTimer(round.id, "pause")}>
                    ⏸ Pause
                  </TimerBtn>
                ) : (
                  <TimerBtn className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700" onClick={() => onTimer(round.id, "start")}>
                    ▶ {round.elapsedMs > 0 ? "Resume" : "Start"}
                  </TimerBtn>
                )}
                <TimerBtn className="bg-white/15 hover:bg-white/25 active:bg-white/30" onClick={() => onTimer(round.id, "reset")}>
                  ↺ Reset
                </TimerBtn>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {!isDone ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <GoalButton theme={themeA} label={teamLabel(round.teamA, teamNames)} onClick={() => setPicker(picker === round.teamA ? null : round.teamA)} active={picker === round.teamA} />
            <GoalButton theme={themeB} label={teamLabel(round.teamB, teamNames)} onClick={() => setPicker(picker === round.teamB ? null : round.teamB)} active={picker === round.teamB} />
          </div>
        ) : null}

        {picker != null && !isDone ? (
          <GoalPicker
            teamNo={picker}
            teamName={teamLabel(picker, teamNames)}
            theme={themeFor(picker)}
            roster={picker === round.teamA ? rosterA : rosterB}
            onCancel={() => setPicker(null)}
            onConfirm={(scorer, assist) => {
              onAddGoal(round, picker, scorer, assist);
              setPicker(null);
            }}
          />
        ) : null}

        <GoalLog round={round} teamNames={teamNames} photoOf={photoOf} onDelete={onDeleteGoal} />

        <div className="mt-4 flex items-center gap-3 border-t border-black/5 pt-3 dark:border-white/5">
          {!isDone ? (
            <button
              onClick={() => onEndRound(round.id)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              End round
            </button>
          ) : null}
          <button
            onClick={() => onDeleteRound(round.id)}
            className="rounded-lg px-3 py-2 text-sm text-neutral-500 transition hover:text-red-600"
          >
            Delete round
          </button>
        </div>
      </div>
    </div>
  );
}

function TimerBtn({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl px-4 py-4 text-lg font-bold text-white transition active:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  );
}

function GoalButton({
  theme,
  label,
  onClick,
  active,
}: {
  theme: Theme;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-5 text-lg font-bold text-white transition active:scale-[0.98] ${theme.solid} ${
        active ? "ring-4 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950 " + theme.ring : ""
      }`}
    >
      <span className="text-2xl" aria-hidden="true">
        ⚽
      </span>
      Goal · {label}
    </button>
  );
}

function GoalPicker({
  teamNo,
  teamName,
  theme,
  roster,
  onCancel,
  onConfirm,
}: {
  teamNo: number;
  teamName: string;
  theme: Theme;
  roster: MatchTeamPlayer[];
  onCancel: () => void;
  onConfirm: (scorer: MatchTeamPlayer, assist: MatchTeamPlayer | null) => void;
}) {
  const [scorer, setScorer] = useState<MatchTeamPlayer | null>(null);
  const [assist, setAssist] = useState<MatchTeamPlayer | null>(null);

  if (roster.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-black/15 p-4 text-sm text-neutral-500 dark:border-white/15">
        {teamName} has no drafted players yet.
        <button onClick={onCancel} className="ml-2 underline">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className={`mt-3 rounded-2xl p-4 ${theme.soft}`}>
      <p className="text-sm font-bold">{teamName} — who scored?</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {roster.map((p) => (
          <PlayerChip
            key={personValue(p)}
            player={p}
            theme={theme}
            selected={scorer === p}
            onClick={() => {
              setScorer(scorer === p ? null : p);
              if (assist === p) setAssist(null);
            }}
          />
        ))}
      </div>

      <p className="mt-4 text-sm font-bold">Assist? (optional)</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {roster.map((p) => (
          <PlayerChip
            key={personValue(p)}
            player={p}
            theme={theme}
            selected={assist === p}
            disabled={scorer === p}
            variant="assist"
            onClick={() => setAssist(assist === p ? null : p)}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!scorer}
          onClick={() => scorer && onConfirm(scorer, assist)}
          className={`flex-1 rounded-2xl px-4 py-4 text-lg font-bold text-white transition active:scale-[0.98] disabled:opacity-40 ${theme.solid}`}
        >
          ⚽ Log goal
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl px-4 py-4 text-base font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
      <span className="sr-only">Team {teamNo}</span>
    </div>
  );
}

function PlayerChip({
  player,
  theme,
  selected,
  disabled,
  variant = "scorer",
  onClick,
}: {
  player: MatchTeamPlayer;
  theme: Theme;
  selected: boolean;
  disabled?: boolean;
  variant?: "scorer" | "assist";
  onClick: () => void;
}) {
  const selectedClass =
    variant === "assist" ? "bg-sky-600 text-white" : `${theme.solid} text-white`;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition active:scale-[0.97] disabled:opacity-30 ${
        selected ? selectedClass : "bg-white/70 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20"
      }`}
    >
      <Avatar name={player.name} photoUrl={player.photoUrl} theme={theme} className="h-8 w-8" />
      <span className="truncate">
        {player.name}
        {player.isGuest ? <span className="block text-[10px] font-normal opacity-70">guest</span> : null}
      </span>
    </button>
  );
}

function GoalLog({
  round,
  teamNames,
  photoOf,
  onDelete,
}: {
  round: MatchRound;
  teamNames: Record<number, string>;
  photoOf: (ref: PersonRef) => string | null;
  onDelete: (roundId: number, goalId: number) => void;
}) {
  if (round.goals.length === 0) {
    return <p className="mt-4 text-sm text-neutral-500">No goals logged yet.</p>;
  }
  return (
    <ul className="mt-4 space-y-2">
      {round.goals.map((g) => {
        const theme = themeFor(g.teamNo);
        return (
          <li
            key={g.id}
            className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]"
          >
            <Avatar name={g.scorer.name} photoUrl={photoOf(g.scorer)} theme={theme} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {g.scorer.name}
                <span className={`ml-2 inline-block h-2 w-2 rounded-full ${theme.dot}`} />
              </p>
              {g.assist ? (
                <p className="truncate text-xs text-neutral-500">assist · {g.assist.name}</p>
              ) : (
                <p className="truncate text-xs text-neutral-400">{teamLabel(g.teamNo, teamNames)}</p>
              )}
            </div>
            <button
              onClick={() => onDelete(round.id, g.id)}
              aria-label="Remove goal"
              className="rounded-lg px-2 py-2 text-neutral-400 transition hover:text-red-600"
            >
              ✕
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Day tally + stats sync ───────────────────────────────────────────────

function DayTally({
  tally,
  matchId,
  photoOf,
  onError,
}: {
  tally: DayTallyRow[];
  matchId: number;
  photoOf: (ref: PersonRef) => string | null;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">Today&apos;s scorers</h2>
        <Button
          type="button"
          variant="secondary"
          pending={pending}
          pendingLabel="Syncing…"
          onClick={() =>
            startTransition(async () => {
              setNote("");
              const res = await syncStatsAction(matchId);
              if (res.ok) setNote(res.message);
              else onError(res.message);
            })
          }
        >
          Sync to match stats
        </Button>
      </div>

      {tally.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No goals logged yet today.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {tally.map((t, i) => {
            const isPlayer = t.key.startsWith("p:");
            const idNum = Number(t.key.slice(2));
            const ref: PersonRef = {
              playerId: isPlayer ? idNum : null,
              guestId: isPlayer ? null : idNum,
              name: t.name,
            };
            return (
              <li
                key={t.key}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm odd:bg-black/[0.02] dark:odd:bg-white/[0.03]"
              >
                <span className="w-6 text-center text-base">{medals[i] ?? ""}</span>
                <Avatar name={t.name} photoUrl={photoOf(ref)} theme={THEMES[i % THEMES.length]} className="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className="tabular-nums">
                  <span className="font-bold">{t.goals}</span>
                  <span className="text-neutral-400"> G</span>
                </span>
                <span className="w-12 text-right tabular-nums text-neutral-500">{t.assists} A</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Sync writes each roster player&apos;s goals and assists into this match&apos;s stats, feeding the
        leaderboard and awards. Guests appear in the live log but not in season stats.
      </p>
      {note ? <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{note}</p> : null}
    </div>
  );
}
