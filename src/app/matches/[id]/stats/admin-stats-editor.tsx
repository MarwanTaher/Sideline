"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { adminSetStatAction, type StatsSubmitState } from "./actions";
import type { RosterStat } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: StatsSubmitState = { ok: false, message: "" };

function StatRow({ matchId, player }: { matchId: number; player: RosterStat }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(adminSetStatAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="playerId" value={player.playerId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{player.name}</p>
        <p className="text-xs text-neutral-500">Team {player.teamNo}</p>
      </div>
      <label className="block text-xs">
        <span className="font-medium text-neutral-500">Goals</span>
        <input
          type="number"
          name="goals"
          min={0}
          max={50}
          step={1}
          defaultValue={player.goals}
          className="mt-1 w-20 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
        />
      </label>
      <label className="block text-xs">
        <span className="font-medium text-neutral-500">Assists</span>
        <input
          type="number"
          name="assists"
          min={0}
          max={50}
          step={1}
          defaultValue={player.assists}
          className="mt-1 w-20 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
        />
      </label>
      <Button type="submit" pending={pending} pendingLabel="Saving…" size="sm">
        Save
      </Button>
      {state.message ? (
        <div className="w-full">
          <FeedbackMessage ok={state.ok} message={state.message} />
        </div>
      ) : null}
    </form>
  );
}

export interface AdminStatsEditorProps {
  matchId: number;
  players: RosterStat[];
}

export function AdminStatsEditor({ matchId, players }: AdminStatsEditorProps) {
  return (
    <section className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-lg font-semibold tracking-tight">Admin: edit scores</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Set each player&apos;s goals and assists for this match. Saving writes
        straight to the approved stats and updates the leaderboard.
      </p>
      {players.length === 0 ? (
        <p className="mt-4 rounded-lg bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500 dark:bg-neutral-800">
          No players are on the roster for this match yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {players.map((p) => (
            <StatRow key={p.playerId} matchId={matchId} player={p} />
          ))}
        </div>
      )}
    </section>
  );
}
