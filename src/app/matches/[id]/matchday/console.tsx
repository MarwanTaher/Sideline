"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { useLocalStorage, writeLocal } from "@/lib/local-store";
import { BallIcon, SwapIcon, UndoIcon, PlusIcon, MedalIcon, PencilIcon, XIcon } from "@/components/ui/icons";
import type { MatchTeam, MatchTeamPlayer } from "@/lib/matches";
import type {
  MatchdayConsole as ConsoleData,
  MatchRound,
  RoundGoal,
  PersonRef,
  DayTally as DayTallyRow,
  Scorekeeper,
} from "@/lib/matchday";
import {
  createRoundAction,
  endRoundAction,
  deleteRoundAction,
  timerAction as timerServerAction,
  addGoalAction,
  updateGoalAction,
  deleteGoalAction,
  syncStatsAction,
  addScorekeeperAction,
  removeScorekeeperAction,
  addSubstituteAction,
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
  { dot: "bg-violet-500", soft: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", solid: "bg-violet-600 hover:bg-violet-700 active:bg-violet-800", ring: "ring-violet-500/40" },
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

/** Suggest the next round: winner stays, bring in the team that has waited longest. */
function suggestTeams(rounds: MatchRound[], teamNumbers: number[]): [number, number] {
  const fallback: [number, number] = [teamNumbers[0], teamNumbers[1] ?? teamNumbers[0]];
  if (teamNumbers.length < 2) return fallback;
  const last = rounds.reduce<MatchRound | null>(
    (m, r) => (!m || r.roundNo > m.roundNo ? r : m),
    null,
  );
  if (!last) return fallback;
  const winner = last.scoreA >= last.scoreB ? last.teamA : last.teamB;
  const loser = winner === last.teamA ? last.teamB : last.teamA;
  if (teamNumbers.length === 2) return [winner, loser];
  const lastPlayed = new Map<number, number>();
  for (const r of rounds) {
    lastPlayed.set(r.teamA, Math.max(lastPlayed.get(r.teamA) ?? 0, r.roundNo));
    lastPlayed.set(r.teamB, Math.max(lastPlayed.get(r.teamB) ?? 0, r.roundNo));
  }
  const bench = teamNumbers
    .filter((t) => t !== winner && t !== loser)
    .sort((a, b) => (lastPlayed.get(a) ?? 0) - (lastPlayed.get(b) ?? 0) || a - b);
  return [winner, bench[0] ?? loser];
}

/**
 * Server/client clock-skew corrected "now" in the server epoch. The offset is
 * fixed on the first call after `serverNowMs` arrives (like measuring it at mount).
 */
function useServerNow(serverNowMs: number): () => number {
  return useMemo(() => {
    let offset: number | null = null;
    return () => {
      const local = Date.now();
      offset ??= serverNowMs - local;
      return local + offset;
    };
  }, [serverNowMs]);
}
function useTick(active: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(h);
  }, [active]);
}

// ── Sound + haptic cues ─────────────────────────────────────────────────────

interface Cues {
  enabled: boolean;
  toggle: () => void;
  goal: () => void;
  whistle: () => void;
}
function useCues(): Cues {
  const enabled = useLocalStorage("matchday:sound") !== "off";
  const ctxRef = useRef<AudioContext | null>(null);

  const toggle = useCallback(() => {
    writeLocal("matchday:sound", enabled ? "off" : "on");
  }, [enabled]);

  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const tone = useCallback(
    (steps: { f: number; t: number; d: number }[]) => {
      if (!enabled || typeof window === "undefined") return;
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = ctxRef.current ?? new Ctor();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        for (const s of steps) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = s.f;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + s.t);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + s.t + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + s.t + s.d);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + s.t);
          osc.stop(ctx.currentTime + s.t + s.d + 0.02);
        }
      } catch {
        /* ignore */
      }
    },
    [enabled],
  );

  const goal = useCallback(() => {
    vibrate([40, 30, 80]);
    tone([
      { f: 660, t: 0, d: 0.12 },
      { f: 880, t: 0.12, d: 0.18 },
    ]);
  }, [tone, vibrate]);

  const whistle = useCallback(() => {
    vibrate(220);
    tone([{ f: 1200, t: 0, d: 0.35 }]);
  }, [tone, vibrate]);

  return { enabled, toggle, goal, whistle };
}

// ── Avatar + pitch ───────────────────────────────────────────────────────────

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
    return (
      // eslint-disable-next-line @next/next/no-img-element
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
  isAdmin,
  scorekeepers,
  assignablePlayers,
}: {
  matchId: number;
  initial: ConsoleData;
  isAdmin: boolean;
  scorekeepers: Scorekeeper[];
  assignablePlayers: Scorekeeper[];
}) {
  const { teamNames } = initial;
  const teamNumbers = initial.teams.map((t) => t.teamNo);

  // Rosters are fluid: subs can be dropped onto a team live, so teams are state.
  const [teams, setTeams] = useState<MatchTeam[]>(initial.teams);
  const [rounds, setRounds] = useState<MatchRound[]>(initial.rounds);
  const [error, setError] = useState("");
  const [watch, setWatch] = useState(false);
  // Players subbed off this session: hidden from pickers but still on the team
  // in the DB, so their goals/assists stay counted and they can be brought back.
  const [benched, setBenched] = useState<Set<number>>(() => new Set());
  const [, startTransition] = useTransition();
  const cues = useCues();

  const rosterByTeam = useMemo(() => {
    const map = new Map<number, MatchTeamPlayer[]>();
    for (const t of teams) map.set(t.teamNo, t.players);
    return map;
  }, [teams]);

  // Candidates for a team's add/loan picker: all active players. Each picker
  // hides players already on that team; players on another team show as loans.
  const assignable = assignablePlayers;

  const photoIndex = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of teams) for (const p of t.players) map.set(personValue(p), p.photoUrl ?? null);
    return map;
  }, [teams]);
  const photoOf = useCallback(
    (ref: PersonRef | null) => (ref ? photoIndex.get(keyOfRef(ref)) ?? null : null),
    [photoIndex],
  );

  const nowFn = useServerNow(initial.serverNowMs);
  const anyRunning = rounds.some((r) => r.running);
  useTick(anyRunning);

  // Persisted last pairing (only used before any round exists).
  const rawPair = useLocalStorage(`matchday:lastPair:${matchId}`);
  const persistedPair = useMemo<[number, number] | null>(() => {
    if (!rawPair) return null;
    try {
      const p = JSON.parse(rawPair);
      return Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] : null;
    } catch {
      return null;
    }
  }, [rawPair]);

  const suggested = useMemo<[number, number]>(() => {
    if (rounds.length > 0) return suggestTeams(rounds, teamNumbers);
    if (
      persistedPair &&
      teamNumbers.includes(persistedPair[0]) &&
      teamNumbers.includes(persistedPair[1]) &&
      persistedPair[0] !== persistedPair[1]
    ) {
      return persistedPair;
    }
    return [teamNumbers[0], teamNumbers[1] ?? teamNumbers[0]];
  }, [rounds, teamNumbers, persistedPair]);

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
      writeLocal(`matchday:lastPair:${matchId}`, JSON.stringify([teamA, teamB]));
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
    (
      round: MatchRound,
      teamNo: number,
      scorer: MatchTeamPlayer | null,
      assist: MatchTeamPlayer | null,
      isOwnGoal: boolean,
    ) => {
      setError("");
      cues.goal();
      const tempId = -Date.now();
      const sref = scorer ? refFromPlayer(scorer) : null;
      const aref = assist ? refFromPlayer(assist) : null;
      const goal: RoundGoal = {
        id: tempId, roundId: round.id, teamNo, scorer: sref, assist: aref, isOwnGoal,
        createdAt: new Date().toISOString(),
      };
      setRounds((prev) =>
        prev.map((r) => (r.id === round.id ? recomputeScore({ ...r, goals: [...r.goals, goal] }) : r)),
      );
      run(
        async () => {
          const res = await addGoalAction({
            matchId, roundId: round.id, teamNo,
            scorerPlayerId: sref?.playerId ?? null, scorerGuestId: sref?.guestId ?? null,
            assistPlayerId: aref?.playerId ?? null, assistGuestId: aref?.guestId ?? null,
            isOwnGoal,
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
    [matchId, run, cues],
  );

  const handleUpdateGoal = useCallback(
    (roundId: number, goalId: number, scorer: MatchTeamPlayer, assist: MatchTeamPlayer | null) => {
      setError("");
      const sref = refFromPlayer(scorer);
      const aref = assist ? refFromPlayer(assist) : null;
      let prevGoal: RoundGoal | undefined;
      setRounds((prev) =>
        prev.map((r) => {
          if (r.id !== roundId) return r;
          return {
            ...r,
            goals: r.goals.map((g) => {
              if (g.id !== goalId) return g;
              prevGoal = g;
              return { ...g, scorer: sref, assist: aref, isOwnGoal: false };
            }),
          };
        }),
      );
      if (goalId > 0) {
        run(
          () =>
            updateGoalAction({
              matchId, goalId,
              scorerPlayerId: sref.playerId, scorerGuestId: sref.guestId,
              assistPlayerId: aref?.playerId ?? null, assistGuestId: aref?.guestId ?? null,
            }),
          () => {
            if (prevGoal) {
              setRounds((prev) =>
                prev.map((r) =>
                  r.id === roundId
                    ? { ...r, goals: r.goals.map((g) => (g.id === goalId ? prevGoal! : g)) }
                    : r,
                ),
              );
            }
          },
        );
      }
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
      cues.whistle();
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
    [matchId, nowFn, run, cues],
  );

  const handleDeleteRound = useCallback(
    (roundId: number) => {
      setRounds((prev) => prev.filter((r) => r.id !== roundId));
      if (roundId > 0) run(() => deleteRoundAction(matchId, roundId));
    },
    [matchId, run],
  );

  // Drop a sub onto a team live and hand the new roster entry back so the picker
  // can select them immediately. Optimistic: rolled back if the server rejects.
  const handleAddSubstitute = useCallback(
    (teamNo: number, player: Scorekeeper): MatchTeamPlayer => {
      const added: MatchTeamPlayer = {
        playerId: player.playerId,
        name: player.name,
        position: "MID",
        photoUrl: player.photoUrl ?? null,
      };
      // A player already on another team is a loan: let them score for this
      // team without moving them in the DB (their own roster stays intact).
      const isLoan = teams.some(
        (t) => t.teamNo !== teamNo && t.players.some((p) => p.playerId === player.playerId),
      );
      setTeams((prev) =>
        prev.map((t) =>
          t.teamNo === teamNo
            ? {
                ...t,
                players: t.players.some((p) => p.playerId === added.playerId)
                  ? t.players
                  : [...t.players, added],
              }
            : t,
        ),
      );
      // Bringing a player on clears any benched (subbed-off) mark on them.
      setBenched((prev) => {
        if (!prev.has(player.playerId)) return prev;
        const next = new Set(prev);
        next.delete(player.playerId);
        return next;
      });
      if (!isLoan) {
        run(
          () => addSubstituteAction(matchId, player.playerId, teamNo),
          () =>
            setTeams((prev) =>
              prev.map((t) =>
                t.teamNo === teamNo
                  ? { ...t, players: t.players.filter((p) => p.playerId !== added.playerId) }
                  : t,
              ),
            ),
        );
      }
      return added;
    },
    [matchId, run, teams],
  );

  const handleSubOut = useCallback((playerId: number) => {
    setBenched((prev) => new Set(prev).add(playerId));
  }, []);

  const handleBringBack = useCallback((playerId: number) => {
    setBenched((prev) => {
      if (!prev.has(playerId)) return prev;
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  }, []);

  const tally = useMemo(() => deriveTally(rounds), [rounds]);
  const orderedRounds = [...rounds].reverse();

  const cardProps = (round: MatchRound) => ({
    round,
    teamNames,
    rosterA: rosterByTeam.get(round.teamA) ?? [],
    rosterB: rosterByTeam.get(round.teamB) ?? [],
    assignable,
    onAddPlayer: handleAddSubstitute,
    benched,
    onSubOut: handleSubOut,
    onBringBack: handleBringBack,
    nowFn,
    photoOf,
    onTimer: handleTimer,
    onAddGoal: handleAddGoal,
    onUpdateGoal: handleUpdateGoal,
    onDeleteGoal: handleDeleteGoal,
    onEndRound: handleEndRound,
    onDeleteRound: handleDeleteRound,
  });

  // ── Watch mode: focus a single round with huge controls ──
  if (watch) {
    const focus =
      rounds.filter((r) => r.status === "active").sort((a, b) => b.roundNo - a.roundNo)[0] ??
      [...rounds].sort((a, b) => b.roundNo - a.roundNo)[0];
    return (
      <div className="space-y-4">
        <TopBar watch={watch} onWatch={setWatch} cues={cues} />
        {error ? <ErrorBar message={error} onClose={() => setError("")} /> : null}
        {focus ? (
          <RoundCard key={focus.id} watch {...cardProps(focus)} />
        ) : (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
            No rounds yet — leave watch mode to start one.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TopBar watch={watch} onWatch={setWatch} cues={cues} />

      {error ? <ErrorBar message={error} onClose={() => setError("")} /> : null}

      <NewRoundBar
        key={`${suggested[0]}-${suggested[1]}`}
        teamNumbers={teamNumbers}
        teamNames={teamNames}
        suggested={suggested}
        onStart={handleCreateRound}
      />

      {orderedRounds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
          No rounds yet. Tap <span className="font-semibold">Start round</span> to kick off the first game.
        </p>
      ) : (
        <div className="space-y-5">
          {orderedRounds.map((round) => (
            <RoundCard key={round.id} {...cardProps(round)} />
          ))}
        </div>
      )}

      <DayTally tally={tally} matchId={matchId} photoOf={photoOf} onError={setError} />

      {isAdmin ? (
        <ScorekeeperPanel
          matchId={matchId}
          initialScorekeepers={scorekeepers}
          assignablePlayers={assignablePlayers}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function deriveTally(rounds: MatchRound[]): DayTallyRow[] {
  const map = new Map<string, DayTallyRow>();
  for (const r of rounds) {
    for (const g of r.goals) {
      if (g.scorer) {
        const sk = keyOfRef(g.scorer);
        const s = map.get(sk) ?? { key: sk, name: g.scorer.name, goals: 0, assists: 0 };
        s.goals += 1;
        map.set(sk, s);
      }
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

function ErrorBar({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      <span>{message}</span>
      <button onClick={onClose} className="text-lg leading-none" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function TopBar({
  watch,
  onWatch,
  cues,
}: {
  watch: boolean;
  onWatch: (v: boolean) => void;
  cues: Cues;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={cues.toggle}
        aria-pressed={cues.enabled}
        className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        {cues.enabled ? "🔊 Sound" : "🔇 Muted"}
      </button>
      <button
        type="button"
        onClick={() => onWatch(!watch)}
        aria-pressed={watch}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
          watch
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        }`}
      >
        {watch ? "⌚ Exit watch" : "⌚ Watch mode"}
      </button>
    </div>
  );
}

// ── New round bar ─────────────────────────────────────────────────────────

function NewRoundBar({
  teamNumbers,
  teamNames,
  suggested,
  onStart,
}: {
  teamNumbers: number[];
  teamNames: Record<number, string>;
  suggested: [number, number];
  onStart: (a: number, b: number) => void;
}) {
  const [teamA, setTeamA] = useState(suggested[0]);
  const [teamB, setTeamB] = useState(suggested[1]);
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
      <p className="mt-2 text-xs text-neutral-500">Suggested next-up — winner stays on.</p>
    </div>
  );
}

// ── Round card ─────────────────────────────────────────────────────────────

interface RoundCardProps {
  round: MatchRound;
  teamNames: Record<number, string>;
  rosterA: MatchTeamPlayer[];
  rosterB: MatchTeamPlayer[];
  assignable: Scorekeeper[];
  onAddPlayer: (teamNo: number, player: Scorekeeper) => MatchTeamPlayer;
  benched: Set<number>;
  onSubOut: (playerId: number) => void;
  onBringBack: (playerId: number) => void;
  nowFn: () => number;
  photoOf: (ref: PersonRef | null) => string | null;
  onTimer: (roundId: number, a: "start" | "pause" | "reset") => void;
  onAddGoal: (
    round: MatchRound,
    teamNo: number,
    scorer: MatchTeamPlayer | null,
    assist: MatchTeamPlayer | null,
    isOwnGoal: boolean,
  ) => void;
  onUpdateGoal: (roundId: number, goalId: number, scorer: MatchTeamPlayer, assist: MatchTeamPlayer | null) => void;
  onDeleteGoal: (roundId: number, goalId: number) => void;
  onEndRound: (roundId: number) => void;
  onDeleteRound: (roundId: number) => void;
  watch?: boolean;
}

function RoundCard({
  round,
  teamNames,
  rosterA,
  rosterB,
  assignable,
  onAddPlayer,
  benched,
  onSubOut,
  onBringBack,
  nowFn,
  photoOf,
  onTimer,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onEndRound,
  onDeleteRound,
  watch = false,
}: RoundCardProps) {
  const themeA = themeFor(round.teamA);
  const themeB = themeFor(round.teamB);
  const isDone = round.status === "done";
  const liveMs =
    round.running && round.startedAtMs != null ? round.elapsedMs + (nowFn() - round.startedAtMs) : round.elapsedMs;

  const [picker, setPicker] = useState<number | null>(null); // teamNo whose picker is open
  const [editing, setEditing] = useState<number | null>(null); // goalId being edited

  const editingGoal = editing != null ? round.goals.find((g) => g.id === editing) ?? null : null;

  const timerSize = watch ? "text-7xl sm:text-8xl" : "text-5xl sm:text-6xl";
  const scoreSize = watch ? "text-6xl sm:text-7xl" : "text-4xl sm:text-5xl";

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
            <div className={`flex items-center gap-2 font-black tabular-nums ${scoreSize}`}>
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
              className={`rounded-2xl px-6 py-2 font-black tabular-nums ${timerSize} ${
                round.running ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white"
              }`}
            >
              {fmtClock(liveMs)}
            </div>
            {!isDone ? (
              <div className="flex w-full max-w-md items-center gap-2">
                {round.running ? (
                  <TimerBtn className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700" onClick={() => onTimer(round.id, "pause")}>
                    Pause
                  </TimerBtn>
                ) : (
                  <TimerBtn className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700" onClick={() => onTimer(round.id, "start")}>
                    {round.elapsedMs > 0 ? "Resume" : "Start"}
                  </TimerBtn>
                )}
                <TimerBtn className="bg-white/15 hover:bg-white/25 active:bg-white/30" onClick={() => onTimer(round.id, "reset")}>
                  Reset
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
            <GoalButton
              theme={themeA}
              label={teamLabel(round.teamA, teamNames)}
              onClick={() => {
                setEditing(null);
                setPicker(picker === round.teamA ? null : round.teamA);
              }}
              active={picker === round.teamA}
            />
            <GoalButton
              theme={themeB}
              label={teamLabel(round.teamB, teamNames)}
              onClick={() => {
                setEditing(null);
                setPicker(picker === round.teamB ? null : round.teamB);
              }}
              active={picker === round.teamB}
            />
          </div>
        ) : null}

        {picker != null && !isDone ? (
          <GoalPicker
            teamName={teamLabel(picker, teamNames)}
            theme={themeFor(picker)}
            roster={picker === round.teamA ? rosterA : rosterB}
            teamNo={picker}
            assignable={assignable}
            onAddPlayer={onAddPlayer}
            benched={benched}
            onSubOut={onSubOut}
            onBringBack={onBringBack}
            submitLabel="Log goal"
            allowOwnGoal
            onOwnGoal={() => {
              onAddGoal(round, picker, null, null, true);
              setPicker(null);
            }}
            onCancel={() => setPicker(null)}
            onConfirm={(scorer, assist) => {
              onAddGoal(round, picker, scorer, assist, false);
              setPicker(null);
            }}
          />
        ) : null}

        {editingGoal && editingGoal.scorer ? (
          <GoalPicker
            teamName={`Edit goal · ${teamLabel(editingGoal.teamNo, teamNames)}`}
            theme={themeFor(editingGoal.teamNo)}
            roster={editingGoal.teamNo === round.teamA ? rosterA : rosterB}
            teamNo={editingGoal.teamNo}
            assignable={assignable}
            onAddPlayer={onAddPlayer}
            benched={benched}
            onSubOut={onSubOut}
            onBringBack={onBringBack}
            submitLabel="Save changes"
            initialScorerKey={keyOfRef(editingGoal.scorer)}
            initialAssistKey={editingGoal.assist ? keyOfRef(editingGoal.assist) : undefined}
            onCancel={() => setEditing(null)}
            onConfirm={(scorer, assist) => {
              onUpdateGoal(round.id, editingGoal.id, scorer, assist);
              setEditing(null);
            }}
          />
        ) : null}

        <GoalLog
          round={round}
          teamNames={teamNames}
          photoOf={photoOf}
          canEdit={!isDone}
          onEdit={(goalId) => {
            setPicker(null);
            setEditing(editing === goalId ? null : goalId);
          }}
          onDelete={onDeleteGoal}
        />

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
        <BallIcon className="h-6 w-6" />
      </span>
      Goal · {label}
    </button>
  );
}

const EMPTY_BENCH: ReadonlySet<number> = new Set<number>();

function GoalPicker({
  teamName,
  theme,
  roster,
  teamNo,
  assignable = [],
  onAddPlayer,
  benched,
  onSubOut,
  onBringBack,
  submitLabel,
  allowOwnGoal = false,
  initialScorerKey,
  initialAssistKey,
  onOwnGoal,
  onCancel,
  onConfirm,
}: {
  teamName: string;
  theme: Theme;
  roster: MatchTeamPlayer[];
  teamNo: number;
  assignable?: Scorekeeper[];
  onAddPlayer?: (teamNo: number, player: Scorekeeper) => MatchTeamPlayer;
  benched?: ReadonlySet<number>;
  onSubOut?: (playerId: number) => void;
  onBringBack?: (playerId: number) => void;
  submitLabel: string;
  allowOwnGoal?: boolean;
  initialScorerKey?: string;
  initialAssistKey?: string;
  onOwnGoal?: () => void;
  onCancel: () => void;
  onConfirm: (scorer: MatchTeamPlayer, assist: MatchTeamPlayer | null) => void;
}) {
  // Track selections by key, not object identity, so they survive roster changes
  // (e.g. a sub being added mid-pick) and can be pre-selected on add.
  const [scorerKey, setScorerKey] = useState<string | null>(initialScorerKey ?? null);
  const [assistKey, setAssistKey] = useState<string | null>(initialAssistKey ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [replacing, setReplacing] = useState<number | null>(null);

  const scorer = scorerKey ? roster.find((p) => personValue(p) === scorerKey) ?? null : null;
  const assist = assistKey ? roster.find((p) => personValue(p) === assistKey) ?? null : null;

  // Subbed-off players are hidden from selection but stay on the team.
  const benchedIds = benched ?? EMPTY_BENCH;
  const activeRoster = roster.filter((p) => !benchedIds.has(p.playerId));
  const benchedRoster = roster.filter((p) => benchedIds.has(p.playerId));
  const replacingName =
    replacing != null ? roster.find((p) => p.playerId === replacing)?.name ?? null : null;

  // Hide players already on this team; anyone else (including other teams) can
  // be added or loaned in.
  const rosterIds = useMemo(() => new Set(roster.map((p) => p.playerId)), [roster]);
  const candidates = assignable.filter((p) => !rosterIds.has(p.playerId));
  const canAdd = typeof onAddPlayer === "function" && candidates.length > 0;
  const canSub = typeof onSubOut === "function" && candidates.length > 0;
  const filteredAssignable = query.trim()
    ? candidates.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : candidates;

  const closeAdd = () => {
    setShowAdd(false);
    setQuery("");
    setReplacing(null);
  };

  const addPlayer = (p: Scorekeeper) => {
    const added = onAddPlayer!(teamNo, p);
    if (replacing != null) {
      onSubOut?.(replacing);
      setReplacing(null);
    } else {
      setScorerKey(personValue(added));
    }
    setShowAdd(false);
    setQuery("");
  };

  const startSub = (playerId: number) => {
    setReplacing(playerId);
    setShowAdd(true);
    setQuery("");
  };

  const subsControl =
    (canSub && activeRoster.length > 0) || benchedRoster.length > 0 ? (
      <div className="mt-4 border-t border-black/5 pt-3 dark:border-white/5">
        <p className="text-xs font-semibold text-neutral-500">Substitutions</p>
        {canSub && activeRoster.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeRoster.map((p) => (
              <button
                key={personValue(p)}
                type="button"
                onClick={() => startSub(p.playerId)}
                className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                <SwapIcon className="h-3.5 w-3.5" /> Sub {p.name}
              </button>
            ))}
          </div>
        ) : null}
        {benchedRoster.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {benchedRoster.map((p) => (
              <button
                key={personValue(p)}
                type="button"
                onClick={() => onBringBack?.(p.playerId)}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-black/20 px-2 py-1 text-xs text-neutral-500 transition hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
              >
                <UndoIcon className="h-3.5 w-3.5" /> Bring back {p.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  const addControl = canAdd ? (
    <div className="mt-4">
      {showAdd ? (
        <div className="rounded-xl border border-black/10 p-2 dark:border-white/10">
          {replacingName ? (
            <p className="mb-2 text-xs font-medium text-neutral-500">
              Bringing on for {replacingName}
            </p>
          ) : null}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="mb-2 w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none dark:border-white/15 dark:bg-white/5"
          />
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {filteredAssignable.length === 0 ? (
              <p className="px-2 py-1 text-sm text-neutral-500">No matching players.</p>
            ) : (
              filteredAssignable.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => addPlayer(p)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span className="font-medium">{p.name}</span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={closeAdd}
            className="mt-1 px-2 py-1 text-xs text-neutral-500 underline"
          >
            Close
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-black/20 px-3 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
        >
          <PlusIcon className="h-4 w-4" /> Add or loan a player to {teamName}
        </button>
      )}
    </div>
  ) : null;

  if (roster.length === 0) {
    return (
      <div className={`mt-3 rounded-2xl p-4 ${theme.soft}`}>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {teamName} has no players yet.
        </p>
        {addControl}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {allowOwnGoal && onOwnGoal ? (
            <button
              type="button"
              onClick={onOwnGoal}
              className="rounded-2xl border border-black/15 px-4 py-3 text-base font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Own goal
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl px-4 py-3 text-base font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-3 rounded-2xl p-4 ${theme.soft}`}>
      <p className="text-sm font-bold">{teamName} — who scored?</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {activeRoster.map((p) => {
          const key = personValue(p);
          return (
            <PlayerChip
              key={key}
              player={p}
              theme={theme}
              selected={scorerKey === key}
              onClick={() => {
                setScorerKey(scorerKey === key ? null : key);
                if (assistKey === key) setAssistKey(null);
              }}
            />
          );
        })}
      </div>

      <p className="mt-4 text-sm font-bold">Assist? (optional)</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {activeRoster.map((p) => {
          const key = personValue(p);
          return (
            <PlayerChip
              key={key}
              player={p}
              theme={theme}
              selected={assistKey === key}
              disabled={scorerKey === key}
              variant="assist"
              onClick={() => setAssistKey(assistKey === key ? null : key)}
            />
          );
        })}
      </div>

      {addControl}
      {subsControl}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!scorer}
          onClick={() => scorer && onConfirm(scorer, assist)}
          className={`flex-1 rounded-2xl px-4 py-4 text-lg font-bold text-white transition active:scale-[0.98] disabled:opacity-40 ${theme.solid}`}
        >
          {submitLabel}
        </button>
        {allowOwnGoal && onOwnGoal ? (
          <button
            type="button"
            onClick={onOwnGoal}
            className="rounded-2xl border border-black/15 px-4 py-4 text-base font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Own goal
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl px-4 py-4 text-base font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
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
  canEdit,
  onEdit,
  onDelete,
}: {
  round: MatchRound;
  teamNames: Record<number, string>;
  photoOf: (ref: PersonRef | null) => string | null;
  canEdit: boolean;
  onEdit: (goalId: number) => void;
  onDelete: (roundId: number, goalId: number) => void;
}) {
  if (round.goals.length === 0) {
    return <p className="mt-4 text-sm text-neutral-500">No goals logged yet.</p>;
  }
  return (
    <ul className="mt-4 space-y-2">
      {round.goals.map((g) => {
        const theme = themeFor(g.teamNo);
        const title = g.isOwnGoal ? "Own goal" : g.scorer?.name ?? "Unknown";
        return (
          <li
            key={g.id}
            className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]"
          >
            {g.isOwnGoal || !g.scorer ? (
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-base dark:bg-neutral-700"
                aria-hidden="true"
              >
                <BallIcon className="h-5 w-5" />
              </span>
            ) : (
              <Avatar name={g.scorer.name} photoUrl={photoOf(g.scorer)} theme={theme} className="h-9 w-9" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {title}
                <span className={`ml-2 inline-block h-2 w-2 rounded-full ${theme.dot}`} />
              </p>
              {g.assist ? (
                <p className="truncate text-xs text-neutral-500">assist · {g.assist.name}</p>
              ) : (
                <p className="truncate text-xs text-neutral-400">{teamLabel(g.teamNo, teamNames)}</p>
              )}
            </div>
            {canEdit && !g.isOwnGoal && g.scorer ? (
              <button
                onClick={() => onEdit(g.id)}
                aria-label="Edit goal"
                className="min-h-11 min-w-11 rounded-lg px-2 py-2 text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            ) : null}
            <button
              onClick={() => onDelete(round.id, g.id)}
              aria-label="Remove goal"
              className="min-h-11 min-w-11 rounded-lg px-2 py-2 text-neutral-500 transition hover:text-red-600 dark:text-neutral-300"
            >
              <XIcon className="h-4 w-4" />
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
  photoOf: (ref: PersonRef | null) => string | null;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

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
                <span className="flex w-6 justify-center">
                  {i < 3 ? (
                    <MedalIcon place={i + 1} className="h-5 w-5" />
                  ) : (
                    <span className="text-xs tabular-nums text-neutral-400">{i + 1}</span>
                  )}
                </span>
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
        leaderboard and awards. Own goals and guests appear in the live log but not in season stats.
      </p>
      {note ? <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{note}</p> : null}
    </div>
  );
}

// ── Scorekeeper management (admin only) ──────────────────────────────────────

function ScorekeeperPanel({
  matchId,
  initialScorekeepers,
  assignablePlayers,
  onError,
}: {
  matchId: number;
  initialScorekeepers: Scorekeeper[];
  assignablePlayers: Scorekeeper[];
  onError: (msg: string) => void;
}) {
  const [list, setList] = useState<Scorekeeper[]>(initialScorekeepers);
  const [pick, setPick] = useState<number | "">("");
  const [, startTransition] = useTransition();

  const assignedIds = useMemo(() => new Set(list.map((s) => s.playerId)), [list]);
  const options = assignablePlayers.filter((p) => !assignedIds.has(p.playerId));

  const add = useCallback(
    (playerId: number) => {
      const player = assignablePlayers.find((p) => p.playerId === playerId);
      if (!player) return;
      setList((prev) => [...prev, player].sort((a, b) => a.name.localeCompare(b.name)));
      setPick("");
      startTransition(async () => {
        const res = await addScorekeeperAction(matchId, playerId);
        if (!res.ok) {
          onError(res.message);
          setList((prev) => prev.filter((s) => s.playerId !== playerId));
        }
      });
    },
    [assignablePlayers, matchId, onError],
  );

  const remove = useCallback(
    (playerId: number) => {
      const prevList = list;
      setList((prev) => prev.filter((s) => s.playerId !== playerId));
      startTransition(async () => {
        const res = await removeScorekeeperAction(matchId, playerId);
        if (!res.ok) {
          onError(res.message);
          setList(prevList);
        }
      });
    },
    [list, matchId, onError],
  );

  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-base font-bold">Scorekeepers</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Let specific players run this matchday console without giving them admin rights.
      </p>

      {list.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {list.map((s) => (
            <li
              key={s.playerId}
              className="flex items-center gap-2 rounded-full bg-black/[0.04] py-1 pl-1 pr-2 text-sm dark:bg-white/[0.06]"
            >
              <Avatar name={s.name} photoUrl={s.photoUrl} theme={THEMES[0]} className="h-7 w-7" />
              <span className="font-medium">{s.name}</span>
              <button
                onClick={() => remove(s.playerId)}
                aria-label={`Remove ${s.name}`}
                className="rounded-full px-1 text-neutral-400 transition hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">No scorekeepers yet — only admins can score.</p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value === "" ? "" : Number(e.target.value))}
          className="flex-1 rounded-xl border border-black/15 bg-transparent px-3 py-2.5 text-sm dark:border-white/15"
        >
          <option value="">Add a scorekeeper…</option>
          {options.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pick === ""}
          onClick={() => pick !== "" && add(pick)}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Add
        </button>
      </div>
    </div>
  );
}
