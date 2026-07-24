"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { POSITIONS, type Position } from "@/lib/positions";
import type { DraftPlayer } from "@/lib/draft";
import {
  autoBalanceAction,
  saveDraftAction,
  resetDraftAction,
  type DraftActionState,
} from "./actions";

const BENCH = "bench";
const INITIAL: DraftActionState = { ok: false, message: "" };

type ColumnMap = Record<string, number[]>;

function teamKey(n: number): string {
  return `team-${n}`;
}

function teamNoFromKey(key: string): number | null {
  if (key === BENCH) return null;
  const n = Number(key.replace("team-", ""));
  return Number.isFinite(n) ? n : null;
}

function buildInitial(players: DraftPlayer[], numTeams: number): {
  columns: ColumnMap;
  positions: Record<number, Position>;
} {
  const columns: ColumnMap = { [BENCH]: [] };
  for (let t = 1; t <= numTeams; t++) columns[teamKey(t)] = [];
  const positions: Record<number, Position> = {};

  for (const p of players) {
    positions[p.playerId] = p.positionPlayed ?? p.preferredPosition;
    if (p.teamNo == null) {
      columns[BENCH].push(p.playerId);
    } else {
      const key = teamKey(p.teamNo);
      if (!columns[key]) columns[key] = [];
      columns[key].push(p.playerId);
    }
  }
  return { columns, positions };
}

// Signature of the server-provided arrangement; when it changes we resync.
function serverSignature(players: DraftPlayer[]): string {
  return players
    .map((p) => `${p.playerId}:${p.teamNo ?? "b"}:${p.positionPlayed ?? p.preferredPosition}`)
    .sort()
    .join("|");
}

export interface DraftBoardProps {
  matchId: number;
  numTeams: number;
  players: DraftPlayer[];
  canEdit: boolean;
}

export function DraftBoard({ matchId, numTeams, players, canEdit }: DraftBoardProps) {
  const router = useRouter();
  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.playerId, p] as const)),
    [players],
  );

  const signature = useMemo(() => serverSignature(players), [players]);
  const [teamCount, setTeamCount] = useState(numTeams);
  const initial = useMemo(() => buildInitial(players, numTeams), [players, numTeams]);
  const [columns, setColumns] = useState<ColumnMap>(initial.columns);
  const [positions, setPositions] = useState<Record<number, Position>>(initial.positions);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Resync local board whenever the server data changes (auto-balance / reset / save).
  useEffect(() => {
    const rebuilt = buildInitial(players, numTeams);
    setColumns(rebuilt.columns);
    setPositions(rebuilt.positions);
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

  const teamKeys = useMemo(() => {
    const present = new Set<number>();
    for (const key of Object.keys(columns)) {
      const n = teamNoFromKey(key);
      if (n != null && columns[key].length > 0) present.add(n);
    }
    const max = Math.max(teamCount, ...(present.size ? [...present] : [0]));
    return Array.from({ length: max }, (_, i) => teamKey(i + 1));
  }, [columns, teamCount]);

  function findContainer(playerId: number): string | null {
    for (const [key, ids] of Object.entries(columns)) {
      if (ids.includes(playerId)) return key;
    }
    return null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const activePlayer = Number(e.active.id);
    const overId = e.over?.id;
    if (overId == null) return;

    const from = findContainer(activePlayer);
    // `over` can be a container id (empty column) or a player id.
    const overContainer =
      typeof overId === "string" && (overId === BENCH || overId.startsWith("team-"))
        ? overId
        : findContainer(Number(overId));
    if (!from || !overContainer || from === overContainer) return;

    setColumns((prev) => {
      const next: ColumnMap = { ...prev };
      next[from] = prev[from].filter((id) => id !== activePlayer);
      const overIds = [...prev[overContainer]];
      const overIndex =
        typeof overId === "number" || (typeof overId === "string" && !overId.startsWith("team-") && overId !== BENCH)
          ? overIds.indexOf(Number(overId))
          : overIds.length;
      overIds.splice(overIndex < 0 ? overIds.length : overIndex, 0, activePlayer);
      next[overContainer] = overIds;
      return next;
    });
    setDirty(true);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const activePlayer = Number(e.active.id);
    const overId = e.over?.id;
    if (overId == null) return;

    const container = findContainer(activePlayer);
    if (!container) return;
    const overContainer =
      typeof overId === "string" && (overId === BENCH || overId.startsWith("team-"))
        ? overId
        : findContainer(Number(overId));
    if (container !== overContainer) return;

    const oldIndex = columns[container].indexOf(activePlayer);
    const newIndex =
      typeof overId === "number" || (typeof overId === "string" && !overId.startsWith("team-") && overId !== BENCH)
        ? columns[container].indexOf(Number(overId))
        : columns[container].length - 1;
    if (oldIndex !== newIndex && newIndex >= 0) {
      setColumns((prev) => ({
        ...prev,
        [container]: arrayMove(prev[container], oldIndex, newIndex),
      }));
      setDirty(true);
    }
  }

  function setPlayerPosition(playerId: number, pos: Position) {
    setPositions((prev) => ({ ...prev, [playerId]: pos }));
    setDirty(true);
  }

  const savePayload = useMemo(() => {
    const assignments: { playerId: number; teamNo: number; position: Position }[] = [];
    const benchPlayerIds: number[] = [];
    for (const [key, ids] of Object.entries(columns)) {
      const teamNo = teamNoFromKey(key);
      for (const pid of ids) {
        if (teamNo == null) benchPlayerIds.push(pid);
        else assignments.push({ playerId: pid, teamNo, position: positions[pid] ?? "MID" });
      }
    }
    return JSON.stringify({ assignments, benchPlayerIds });
  }, [columns, positions]);

  const activePlayer = activeId != null ? playerMap.get(activeId) : null;
  const busy = autoPending || savePending || resetPending;

  const statusMsg =
    (saveState.message && { ok: saveState.ok, message: saveState.message }) ||
    (autoState.message && { ok: autoState.ok, message: autoState.message }) ||
    (resetState.message && { ok: resetState.ok, message: resetState.message }) ||
    null;

  if (players.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
        No candidates yet. Players appear here once they mark themselves available
        (&ldquo;in&rdquo;) or are already on the roster.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <form action={autoFormAction} className="flex items-center gap-2">
            <input type="hidden" name="matchId" value={matchId} />
            <label className="text-sm text-neutral-500">
              Teams:{" "}
              <select
                name="numTeams"
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="rounded border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15"
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {autoPending ? "Balancing…" : "Auto-balance"}
            </button>
            <button
              type="submit"
              name="reroll"
              value="1"
              disabled={busy}
              title="Keep it balanced, but shuffle near-equal players into different sides"
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
            >
              Re-roll
            </button>
          </form>

          <form action={saveFormAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="payload" value={savePayload} />
            <button
              type="submit"
              disabled={busy || !dirty}
              className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              {savePending ? "Saving…" : dirty ? "Save teams" : "Saved"}
            </button>
          </form>
        </div>
      ) : null}

      {statusMsg ? (
        <p
          className={`mt-3 text-sm ${statusMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {statusMsg.message}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamKeys.map((key) => (
            <Column
              key={key}
              id={key}
              title={`Team ${teamNoFromKey(key)}`}
              ids={columns[key] ?? []}
              playerMap={playerMap}
              positions={positions}
              canEdit={canEdit}
              onPositionChange={setPlayerPosition}
            />
          ))}
          <Column
            id={BENCH}
            title="Bench"
            subtitle="Not assigned"
            ids={columns[BENCH] ?? []}
            playerMap={playerMap}
            positions={positions}
            canEdit={canEdit}
            onPositionChange={setPlayerPosition}
          />
        </div>

        <DragOverlay>
          {activePlayer ? (
            <PlayerCardView
              player={activePlayer}
              position={positions[activePlayer.playerId] ?? "MID"}
              dragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {canEdit ? (
        <form
          action={resetFormAction}
          className="mt-8 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 p-4 dark:border-red-900/50"
        >
          <input type="hidden" name="matchId" value={matchId} />
          <span className="text-sm text-neutral-500">
            Reset clears the draft <strong>and</strong> all votes, stats and payments for this match.
          </span>
          <input
            type="text"
            name="confirm"
            placeholder="Type RESET"
            className="rounded border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-red-600 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {resetPending ? "Resetting…" : "Reset draft"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

interface ColumnProps {
  id: string;
  title: string;
  subtitle?: string;
  ids: number[];
  playerMap: Map<number, DraftPlayer>;
  positions: Record<number, Position>;
  canEdit: boolean;
  onPositionChange: (playerId: number, pos: Position) => void;
}

function Column({
  id,
  title,
  subtitle,
  ids,
  playerMap,
  positions,
  canEdit,
  onPositionChange,
}: ColumnProps) {
  const total = ids.reduce((sum, pid) => sum + (playerMap.get(pid)?.score ?? 0), 0);
  const avg = ids.length ? total / ids.length : 0;

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          {title}{" "}
          <span className="font-normal text-neutral-400">({ids.length})</span>
        </h3>
        {ids.length > 0 && id !== BENCH ? (
          <span className="text-xs text-neutral-400">avg {avg.toFixed(1)}</span>
        ) : subtitle ? (
          <span className="text-xs text-neutral-400">{subtitle}</span>
        ) : null}
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <DroppableArea id={id}>
          {ids.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-neutral-400">Drop players here</p>
          ) : (
            ids.map((pid) => {
              const player = playerMap.get(pid);
              if (!player) return null;
              return (
                <SortablePlayer
                  key={pid}
                  player={player}
                  position={positions[pid] ?? "MID"}
                  canEdit={canEdit}
                  onPositionChange={onPositionChange}
                />
              );
            })
          )}
        </DroppableArea>
      </SortableContext>
    </div>
  );
}

function DroppableArea({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useSortable({ id, data: { container: true } });
  return (
    <div ref={setNodeRef} className="mt-2 min-h-[3rem] space-y-2">
      {children}
    </div>
  );
}

interface SortablePlayerProps {
  player: DraftPlayer;
  position: Position;
  canEdit: boolean;
  onPositionChange: (playerId: number, pos: Position) => void;
}

function SortablePlayer({ player, position, canEdit, onPositionChange }: SortablePlayerProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.playerId,
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <PlayerCardView
        player={player}
        position={position}
        canEdit={canEdit}
        onPositionChange={onPositionChange}
        dragHandleProps={canEdit ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

interface PlayerCardViewProps {
  player: DraftPlayer;
  position: Position;
  dragging?: boolean;
  canEdit?: boolean;
  onPositionChange?: (playerId: number, pos: Position) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

function PlayerCardView({
  player,
  position,
  dragging,
  canEdit,
  onPositionChange,
  dragHandleProps,
}: PlayerCardViewProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-sm shadow-sm dark:bg-neutral-900 ${
        dragging ? "border-neutral-900 dark:border-white" : "border-black/10 dark:border-white/10"
      } ${player.isGuest ? "ring-1 ring-indigo-300 dark:ring-indigo-700" : ""}`}
    >
      {canEdit ? (
        <button
          type="button"
          className="cursor-grab touch-none text-neutral-400 active:cursor-grabbing"
          aria-label="Drag"
          {...dragHandleProps}
        >
          ⠿
        </button>
      ) : null}
      {player.isGuest ? (
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
          Guest
        </span>
      ) : null}
      <span className="flex-1 truncate font-medium">
        {player.name}
        {player.isGuest && player.hostName ? (
          <span className="font-normal text-neutral-400"> · {player.hostName}</span>
        ) : null}
      </span>
      <span className="tabular-nums text-xs text-neutral-400">{player.score.toFixed(1)}</span>
      {canEdit && onPositionChange ? (
        <select
          value={position}
          onChange={(e) => onPositionChange(player.playerId, e.target.value as Position)}
          className="rounded border border-black/15 bg-transparent px-1 py-0.5 text-xs dark:border-white/15"
        >
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ) : (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {position}
        </span>
      )}
    </div>
  );
}
