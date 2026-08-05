"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { POSITIONS, type Position } from "@/lib/positions";
import type { DraftPlayer } from "@/lib/draft";
import { MAX_TEAMS, TEAM_COUNT_OPTIONS, teamGridColumns } from "@/lib/team-constants";
import {
  autoBalanceAction,
  saveDraftAction,
  resetDraftAction,
  type DraftActionState,
} from "./actions";

/* ---------------------------------------------------------------------------
 * Sideline "Lineup Builder" — a premium dark-mode pitch view of the draft.
 * Players are dragged from the bench onto per-team pitches; each pitch cell is
 * a (team, position) drop zone, so a drop sets both the team and position that
 * get persisted through the same saveDraftAction as the classic board.
 * ------------------------------------------------------------------------- */

const BRAND = "#a6ce39";
const INITIAL: DraftActionState = { ok: false, message: "" };

// Pitch rows, attack-upward (FWD at the top, GK guarding the bottom goal).
const ROW_ORDER: Position[] = ["FWD", "MID", "DEF", "GK"];

const BENCH = "bench";

interface Assignment {
  teamNo: number | null;
  position: Position;
}

type AssignMap = Record<number, Assignment>;

function zoneId(teamNo: number, pos: Position): string {
  return `t${teamNo}:${pos}`;
}

function parseZone(id: string): { teamNo: number; pos: Position } | null {
  const m = /^t(\d+):(GK|DEF|MID|FWD)$/.exec(id);
  if (!m) return null;
  return { teamNo: Number(m[1]), pos: m[2] as Position };
}

function buildInitial(players: DraftPlayer[]): AssignMap {
  const map: AssignMap = {};
  for (const p of players) {
    map[p.playerId] = {
      teamNo: p.teamNo,
      position: p.positionPlayed ?? p.preferredPosition,
    };
  }
  return map;
}

// Signature of the server arrangement; when it changes we resync local state.
function serverSignature(players: DraftPlayer[]): string {
  return players
    .map((p) => `${p.playerId}:${p.teamNo ?? "b"}:${p.positionPlayed ?? p.preferredPosition}`)
    .sort()
    .join("|");
}

// Standard formation string from outfield counts, e.g. 2-3-1 (DEF-MID-FWD).
function formationString(byPos: Record<Position, DraftPlayer[]>): string {
  const bands = (["DEF", "MID", "FWD"] as Position[]).map((p) => byPos[p].length);
  // Drop trailing empty bands but keep interior zeros.
  let end = bands.length;
  while (end > 0 && bands[end - 1] === 0) end -= 1;
  const kept = bands.slice(0, end);
  return kept.length ? kept.join("-") : "—";
}

export interface PitchBoardProps {
  matchId: number;
  numTeams: number;
  players: DraftPlayer[];
  canEdit: boolean;
  teamNames?: Record<number, string>;
}

export function PitchBoard({ matchId, numTeams, players, canEdit, teamNames: initialTeamNames }: PitchBoardProps) {
  const router = useRouter();
  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.playerId, p] as const)),
    [players],
  );

  const signature = useMemo(() => serverSignature(players), [players]);
  const [teamCount, setTeamCount] = useState(numTeams);
  const [assign, setAssign] = useState<AssignMap>(() => buildInitial(players));
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Display toggles.
  const [showFormation, setShowFormation] = useState(true);
  const [flip, setFlip] = useState(false);
  const [showScores, setShowScores] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [view, setView] = useState<"field" | "list">("field");
  const [teamNames, setTeamNames] = useState<Record<number, string>>(initialTeamNames ?? {});

  function renameTeam(teamNo: number, name: string) {
    setTeamNames((prev) => ({ ...prev, [teamNo]: name }));
    setDirty(true);
  }

  useEffect(() => {
    setAssign(buildInitial(players));
    setTeamCount(numTeams);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const [autoState, autoFormAction, autoPending] = useActionState(autoBalanceAction, INITIAL);
  const [saveState, saveFormAction, savePending] = useActionState(saveDraftAction, INITIAL);
  const [resetState, resetFormAction, resetPending] = useActionState(resetDraftAction, INITIAL);

  useEffect(() => {
    if (autoState.ok || resetState.ok || saveState.ok) router.refresh();
  }, [autoState, resetState, saveState, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const maxTeam = useMemo(() => {
    let m = teamCount;
    for (const a of Object.values(assign)) if (a.teamNo && a.teamNo > m) m = a.teamNo;
    return Math.min(Math.max(m, 1), MAX_TEAMS);
  }, [assign, teamCount]);

  const teamNos = useMemo(
    () => Array.from({ length: maxTeam }, (_, i) => i + 1),
    [maxTeam],
  );

  // Group players per team and position, plus the bench pool.
  const { byTeam, bench } = useMemo(() => {
    const byTeam = new Map<number, Record<Position, DraftPlayer[]>>();
    for (const n of teamNos) {
      byTeam.set(n, { GK: [], DEF: [], MID: [], FWD: [] });
    }
    const bench: DraftPlayer[] = [];
    for (const p of players) {
      const a = assign[p.playerId] ?? {
        teamNo: p.teamNo,
        position: p.positionPlayed ?? p.preferredPosition,
      };
      if (a.teamNo == null || !byTeam.has(a.teamNo)) {
        bench.push(p);
      } else {
        byTeam.get(a.teamNo)![a.position].push(p);
      }
    }
    return { byTeam, bench };
  }, [players, assign, teamNos]);

  function move(playerId: number, teamNo: number | null, position?: Position) {
    setAssign((prev) => {
      const cur = prev[playerId] ?? { teamNo: null, position: "MID" as Position };
      return {
        ...prev,
        [playerId]: { teamNo, position: position ?? cur.position },
      };
    });
    setDirty(true);
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const playerId = Number(e.active.id);
    const over = e.over?.id;
    if (over == null) return;
    const overId = String(over);
    if (overId === BENCH) {
      move(playerId, null);
      return;
    }
    const parsed = parseZone(overId);
    if (parsed) move(playerId, parsed.teamNo, parsed.pos);
  }

  const savePayload = useMemo(() => {
    const assignments: { playerId: number; teamNo: number; position: Position }[] = [];
    const benchPlayerIds: number[] = [];
    for (const p of players) {
      const a = assign[p.playerId];
      if (!a || a.teamNo == null || a.teamNo > maxTeam) benchPlayerIds.push(p.playerId);
      else assignments.push({ playerId: p.playerId, teamNo: a.teamNo, position: a.position });
    }
    return JSON.stringify({ assignments, benchPlayerIds, teamNames });
  }, [players, assign, maxTeam, teamNames]);

  const activePlayer = activeId != null ? playerMap.get(activeId) ?? null : null;
  const activePos =
    activeId != null ? assign[activeId]?.position ?? "MID" : "MID";
  const busy = autoPending || savePending || resetPending;

  const statusMsg =
    (saveState.message && { ok: saveState.ok, message: saveState.message }) ||
    (autoState.message && { ok: autoState.ok, message: autoState.message }) ||
    (resetState.message && { ok: resetState.ok, message: resetState.message }) ||
    null;

  return (
    <div className="mt-6">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* -------- Settings rail -------- */}
          <aside className="w-full shrink-0 lg:w-72">
            <div className="rounded-2xl border border-white/10 bg-[#111315] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Display
              </p>
              <div className="mt-3 inline-flex w-full rounded-lg border border-white/10 p-0.5">
                {(["field", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`flex-1 rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${
                      view === v
                        ? "bg-white/10 text-neutral-100"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-1">
                <Toggle label="Display formation" checked={showFormation} onChange={setShowFormation} />
                <Toggle label="Player ratings" checked={showScores} onChange={setShowScores} />
                <Toggle label="Player photos" checked={showPhotos} onChange={setShowPhotos} />
                <Toggle label="Flip players" checked={flip} onChange={setFlip} />
              </div>

              {canEdit ? (
                <>
                  <div className="my-4 h-px bg-white/10" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                    Draft
                  </p>
                  <div className="mt-3 space-y-3">
                    <form action={autoFormAction} className="flex items-center gap-2">
                      <input type="hidden" name="matchId" value={matchId} />
                      <label className="flex items-center gap-2 text-sm text-neutral-400">
                        Teams
                        <select
                          name="numTeams"
                          value={teamCount}
                          onChange={(e) => setTeamCount(Number(e.target.value))}
                          className="rounded-lg border border-white/15 bg-[#0d0d0d] px-2 py-1 text-sm text-neutral-100"
                        >
                          {TEAM_COUNT_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={busy}
                        className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 hover:bg-white/5 disabled:opacity-50"
                      >
                        {autoPending ? "Balancing…" : "Auto-balance"}
                      </button>
                    </form>

                    <form action={saveFormAction}>
                      <input type="hidden" name="matchId" value={matchId} />
                      <input type="hidden" name="payload" value={savePayload} />
                      <button
                        type="submit"
                        disabled={busy || !dirty}
                        className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-black transition disabled:opacity-40"
                        style={{ backgroundColor: BRAND }}
                      >
                        {savePending ? "Saving…" : dirty ? "Save lineup" : "Saved"}
                      </button>
                    </form>
                  </div>
                </>
              ) : null}

              {statusMsg ? (
                <p
                  className={`mt-3 text-xs ${statusMsg.ok ? "text-[color:var(--brand)]" : "text-red-400"}`}
                  style={statusMsg.ok ? { color: BRAND } : undefined}
                >
                  {statusMsg.message}
                </p>
              ) : null}
            </div>

            {/* Bench / unassigned pool */}
            <Bench players={bench} canEdit={canEdit} showScores={showScores} showPhotos={showPhotos} />
          </aside>

          {/* -------- Pitches -------- */}
          <div className="min-w-0 flex-1">
            {view === "list" ? (
              <TeamList teamNos={teamNos} byTeam={byTeam} bench={bench} teamNames={teamNames} />
            ) : (
            <div
              className={`grid gap-5 ${teamGridColumns(teamNos.length)}`}
            >
              {teamNos.map((n) => {
                const byPos = byTeam.get(n)!;
                const count =
                  byPos.GK.length + byPos.DEF.length + byPos.MID.length + byPos.FWD.length;
                const avg =
                  count > 0
                    ? (
                        (byPos.GK.concat(byPos.DEF, byPos.MID, byPos.FWD).reduce(
                          (s, p) => s + p.score,
                          0,
                        )) /
                        count
                      ).toFixed(1)
                    : "0.0";
                return (
                  <Pitch
                    key={n}
                    teamNo={n}
                    teamName={teamNames[n] ?? `Team ${n}`}
                    onRename={renameTeam}
                    byPos={byPos}
                    count={count}
                    avg={avg}
                    formation={formationString(byPos)}
                    showFormation={showFormation}
                    showScores={showScores}
                    showPhotos={showPhotos}
                    flip={flip}
                    interactive={canEdit}
                  />
                );
              })}
            </div>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePlayer ? (
            <PlayerNode player={activePlayer} position={activePos} showScores={showScores} showPhotos={showPhotos} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {canEdit ? (
        <form
          action={resetFormAction}
          className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-red-900/40 bg-red-950/10 p-4"
        >
          <input type="hidden" name="matchId" value={matchId} />
          <span className="text-sm text-neutral-400">
            Reset clears the draft <strong className="text-neutral-200">and</strong> all votes, stats
            and payments for this match.
          </span>
          <input
            type="text"
            name="confirm"
            placeholder="Type RESET"
            className="rounded-lg border border-white/15 bg-[#0d0d0d] px-2 py-1 text-sm text-neutral-100"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-red-600 px-3 py-1.5 text-sm font-semibold text-red-300 transition hover:bg-red-950/40 disabled:opacity-50"
          >
            {resetPending ? "Resetting…" : "Reset draft"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

/* ------------------------------ Team list ------------------------------- */

interface TeamListProps {
  teamNos: number[];
  byTeam: Map<number, Record<Position, DraftPlayer[]>>;
  bench: DraftPlayer[];
  teamNames: Record<number, string>;
}

/** Compact, read-only list alternative to the pitch view. */
function TeamList({ teamNos, byTeam, bench, teamNames }: TeamListProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {teamNos.map((n) => {
        const byPos = byTeam.get(n)!;
        const all = ROW_ORDER.flatMap((pos) => byPos[pos].map((p) => ({ p, pos })));
        const count = all.length;
        const avg = count > 0 ? all.reduce((s, x) => s + x.p.score, 0) / count : 0;
        return (
          <TeamListCard
            key={n}
            title={teamNames[n] ?? `Team ${n}`}
            rows={all}
            count={count}
            avg={avg}
          />
        );
      })}
      <TeamListCard
        title="Bench"
        rows={bench.map((p) => ({ p, pos: (p.positionPlayed ?? p.preferredPosition) as Position }))}
        count={bench.length}
        avg={null}
      />
    </div>
  );
}

function TeamListCard({
  title,
  rows,
  count,
  avg,
}: {
  title: string;
  rows: { p: DraftPlayer; pos: Position }[];
  count: number;
  avg: number | null;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: `${BRAND}66`, backgroundColor: "#0b0d0b" }}
    >
      <div className="flex items-baseline justify-between border-b border-white/10 px-3 py-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          {title} <span className="font-normal text-neutral-500">({count})</span>
        </h3>
        {avg != null && count > 0 ? (
          <span className="text-xs text-neutral-500">avg {avg.toFixed(1)}</span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-neutral-500">No players.</p>
      ) : (
        <ol className="divide-y divide-white/5">
          {rows.map(({ p, pos }, i) => (
            <li key={p.playerId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-4 text-center text-xs text-neutral-600">{i + 1}</span>
              <span
                className="w-9 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase text-neutral-300"
                style={{ backgroundColor: `${BRAND}22` }}
              >
                {pos}
              </span>
              {p.isGuest ? (
                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">
                  Guest
                </span>
              ) : null}
              <span className="flex-1 truncate font-medium text-neutral-100">
                {p.name}
                {p.isGuest && p.hostName ? (
                  <span className="font-normal text-neutral-500"> · {p.hostName}</span>
                ) : null}
              </span>
              <span className="w-8 text-right tabular-nums text-xs text-neutral-400">
                {p.score.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------- Pitch ---------------------------------- */

interface PitchProps {
  teamNo: number;
  teamName: string;
  onRename: (teamNo: number, name: string) => void;
  byPos: Record<Position, DraftPlayer[]>;
  count: number;
  avg: string;
  formation: string;
  showFormation: boolean;
  showScores: boolean;
  showPhotos: boolean;
  flip: boolean;
  interactive: boolean;
}

function Pitch({
  teamNo,
  teamName,
  onRename,
  byPos,
  count,
  avg,
  formation,
  showFormation,
  showScores,
  showPhotos,
  flip,
  interactive,
}: PitchProps) {
  const rows = flip ? [...ROW_ORDER].reverse() : ROW_ORDER;
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-3"
      style={{ borderColor: `${BRAND}66`, backgroundColor: "#0b0d0b" }}
    >
      {/* Header: editable team name + formation */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {showFormation ? (
            <span
              className="shrink-0 text-sm font-extrabold italic tracking-tight"
              style={{ color: BRAND }}
            >
              {formation}
            </span>
          ) : null}
          <input
            value={teamName}
            onChange={(e) => onRename(teamNo, e.target.value)}
            readOnly={!interactive}
            aria-label={`Team ${teamNo} name`}
            className="min-w-[5ch] rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black outline-none [field-sizing:content] focus:ring-2 focus:ring-white/40"
            style={{ backgroundColor: BRAND }}
          />
        </div>
        <p className="shrink-0 text-[10px] text-neutral-500">
          {count} · avg {avg}
        </p>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl">
        <PitchSurface />
        <div className="relative z-10 flex min-h-[340px] flex-col justify-between gap-3 px-2 py-4">
          {rows.map((pos) => (
            <PitchRow
              key={pos}
              teamNo={teamNo}
              pos={pos}
              players={byPos[pos]}
              showScores={showScores}
              showPhotos={showPhotos}
              canEdit={interactive}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PitchRow({
  teamNo,
  pos,
  players,
  showScores,
  showPhotos,
  canEdit,
}: {
  teamNo: number;
  pos: Position;
  players: DraftPlayer[];
  showScores: boolean;
  showPhotos: boolean;
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(teamNo, pos), disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[64px] flex-wrap items-center justify-center gap-3 rounded-lg transition ${
        isOver ? "bg-white/5 ring-1 ring-[color:var(--brand)]" : ""
      }`}
      style={isOver ? { boxShadow: `inset 0 0 0 1px ${BRAND}` } : undefined}
    >
      {players.length === 0 ? (
        <EmptySlot pos={pos} canEdit={canEdit} />
      ) : (
        players.map((p) => (
          <DraggableNode
            key={p.playerId}
            player={p}
            position={pos}
            showScores={showScores}
            showPhotos={showPhotos}
            canEdit={canEdit}
          />
        ))
      )}
    </div>
  );
}

function EmptySlot({ pos, canEdit }: { pos: Position; canEdit: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 opacity-40">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed"
        style={{ borderColor: `${BRAND}80`, backgroundColor: "#0d0d0d" }}
      >
        {canEdit ? (
          <span className="text-lg font-light" style={{ color: BRAND }}>
            +
          </span>
        ) : null}
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/50">
        {pos}
      </span>
    </div>
  );
}

/* ------------------------------- Nodes ---------------------------------- */

function DraggableNode({
  player,
  position,
  showScores,
  showPhotos,
  canEdit,
}: {
  player: DraftPlayer;
  position: Position;
  showScores: boolean;
  showPhotos: boolean;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.playerId,
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      {...(canEdit ? { ...attributes, ...listeners } : {})}
      className={`touch-none ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <PlayerNode player={player} position={position} showScores={showScores} showPhotos={showPhotos} />
    </div>
  );
}

function PlayerNode({
  player,
  position,
  showScores,
  showPhotos,
  dragging,
}: {
  player: DraftPlayer;
  position: Position;
  showScores: boolean;
  showPhotos: boolean;
  dragging?: boolean;
}) {
  void position;
  const photo = showPhotos ? player.photoUrl : null;
  return (
    <div className={`flex w-16 flex-col items-center gap-1 ${dragging ? "scale-105" : ""}`}>
      <div className="relative">
        <div
          className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 shadow-lg"
          style={{ borderColor: BRAND, backgroundColor: "#141614" }}
        >
          {photo ? (
            <Image
              src={photo}
              alt={player.name}
              fill
              sizes="44px"
              className="rounded-full object-cover"
            />
          ) : (
            <PersonIcon />
          )}
          {player.isGuest ? (
            <span
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#141614]"
              style={{ backgroundColor: "#818cf8" }}
              title="Guest"
            />
          ) : null}
        </div>
      </div>
      {showScores ? (
        <span
          className="rounded px-1.5 text-[9px] font-bold leading-tight text-black"
          style={{ backgroundColor: BRAND }}
        >
          {player.score.toFixed(0)}
        </span>
      ) : null}
      <span className="max-w-[64px] truncate text-center text-[10px] font-semibold text-neutral-100">
        {player.name.split(" ")[0]}
      </span>
    </div>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" fill="#5b5f5b" />
      <path d="M5.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" fill="#5b5f5b" />
    </svg>
  );
}

/* ------------------------------- Bench ---------------------------------- */

function Bench({
  players,
  canEdit,
  showScores,
  showPhotos,
}: {
  players: DraftPlayer[];
  canEdit: boolean;
  showScores: boolean;
  showPhotos: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BENCH, disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      className={`mt-4 rounded-2xl border bg-[#111315] p-4 transition ${
        isOver ? "border-[color:var(--brand)]" : "border-white/10"
      }`}
      style={isOver ? { borderColor: BRAND } : undefined}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
          Bench
        </p>
        <span className="text-xs text-neutral-500">{players.length}</span>
      </div>
      {players.length === 0 ? (
        <p className="mt-3 text-center text-xs text-neutral-600">
          {canEdit ? "Drop players here to unassign" : "Everyone is on a team"}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          {players.map((p) => (
            <DraggableNode
              key={p.playerId}
              player={p}
              position={p.positionPlayed ?? p.preferredPosition}
              showScores={showScores}
              showPhotos={showPhotos}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Controls -------------------------------- */

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-1.5 text-left"
    >
      <span className="text-sm text-neutral-300">{label}</span>
      <span
        className="relative inline-flex h-5 w-9 items-center rounded-full transition"
        style={{ backgroundColor: checked ? BRAND : "#3a3d3a" }}
      >
        <span
          className="inline-block h-3.5 w-3.5 transform rounded-full transition"
          style={{
            backgroundColor: checked ? "#000" : "#fff",
            transform: checked ? "translateX(19px)" : "translateX(3px)",
          }}
        />
      </span>
    </button>
  );
}

/* ------------------------------ Surface --------------------------------- */

function PitchSurface() {
  return (
    <div className="absolute inset-0">
      {/* Mowed-grass stripes */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(180deg, #16311a 0px, #16311a 28px, #123016 28px, #123016 56px)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />

      {/* Pitch lines */}
      <div className="absolute inset-3 rounded-sm border border-white/20" />
      <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-white/20" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      {/* Penalty boxes */}
      <div className="absolute left-1/2 top-3 h-10 w-28 -translate-x-1/2 border border-t-0 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-10 w-28 -translate-x-1/2 border border-b-0 border-white/20" />
    </div>
  );
}
