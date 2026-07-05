"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { submitVotesAction, type VoteActionState } from "./actions";
import { DEFAULT_RATING, MAX_RATING, MIN_RATING } from "@/lib/voting-constants";
import type { BallotPlayer } from "@/lib/voting";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Banner, FeedbackMessage } from "@/components/ui/banner";

const INITIAL: VoteActionState = { ok: false, message: "" };

interface RowState {
  rating: number;
  skipped: boolean;
}

export interface VoteFormProps {
  matchId: number;
  ballot: BallotPlayer[];
  hasVotedBefore: boolean;
}

export function VoteForm({ matchId, ballot, hasVotedBefore }: VoteFormProps) {
  const router = useRouter();

  const initialRows = useMemo(() => {
    const map: Record<number, RowState> = {};
    for (const b of ballot) {
      map[b.playerId] = {
        rating: b.priorRating ?? DEFAULT_RATING,
        skipped: b.skipped,
      };
    }
    return map;
  }, [ballot]);

  const signature = useMemo(
    () =>
      ballot
        .map((b) => `${b.playerId}:${b.priorRating ?? "n"}:${b.skipped ? 1 : 0}`)
        .join("|"),
    [ballot],
  );

  const [rows, setRows] = useState<Record<number, RowState>>(initialRows);

  // Resync when the server sends updated ballot data (after a save).
  useEffect(() => {
    setRows(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const [state, formAction, pending] = useActionState(submitVotesAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  function setRating(playerId: number, rating: number) {
    setRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], rating } }));
  }

  function setSkipped(playerId: number, skipped: boolean) {
    setRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], skipped } }));
  }

  function setAllSkipped(skipped: boolean) {
    setRows((prev) => {
      const next: Record<number, RowState> = {};
      for (const b of ballot) {
        next[b.playerId] = { ...prev[b.playerId], skipped };
      }
      return next;
    });
  }

  const payload = useMemo(() => {
    const ratings: { playerId: number; rating: number }[] = [];
    const skippedIds: number[] = [];
    for (const b of ballot) {
      const row = rows[b.playerId];
      if (!row) continue;
      if (row.skipped) skippedIds.push(b.playerId);
      else ratings.push({ playerId: b.playerId, rating: row.rating });
    }
    return JSON.stringify({ ratings, skippedIds });
  }, [ballot, rows]);

  const toRateCount = ballot.filter((b) => !rows[b.playerId]?.skipped).length;
  const allSkipped = toRateCount === 0;

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="payload" value={payload} />

      {hasVotedBefore ? (
        <Banner tone="warning">
          Saving will replace your previous votes for this match.
        </Banner>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Drag each slider: <span className="font-medium">0 = worst</span> ·{" "}
          5 = average · <span className="font-medium">10 = best</span>. Use
          &ldquo;Skip&rdquo; for players you can&rsquo;t rate.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAllSkipped(true)}
          >
            Skip all
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAllSkipped(false)}
          >
            Clear skips
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {ballot.map((b) => {
          const row = rows[b.playerId] ?? { rating: DEFAULT_RATING, skipped: false };
          return (
            <li
              key={b.playerId}
              className={`rounded-xl border p-3 transition ${
                row.skipped
                  ? "border-black/5 bg-neutral-50 dark:border-white/5 dark:bg-neutral-900"
                  : "border-black/10 dark:border-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {b.name}{" "}
                  <span className="text-xs font-normal text-neutral-400">Team {b.teamNo}</span>
                </span>
                <div className="flex items-center gap-2">
                  {row.skipped ? <Badge tone="neutral" dot>Skipped</Badge> : null}
                  <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <input
                      type="checkbox"
                      checked={row.skipped}
                      onChange={(e) => setSkipped(b.playerId, e.target.checked)}
                      className="h-4 w-4"
                    />
                    Skip
                  </label>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={MIN_RATING}
                  max={MAX_RATING}
                  step={1}
                  value={row.rating}
                  disabled={row.skipped}
                  aria-label={`Rate ${b.name} from ${MIN_RATING} to ${MAX_RATING}`}
                  aria-valuetext={
                    row.skipped ? "skipped" : `${row.rating} out of ${MAX_RATING}`
                  }
                  onChange={(e) => setRating(b.playerId, Number(e.target.value))}
                  className="flex-1 accent-neutral-900 disabled:opacity-40 dark:accent-white"
                />
                <span className="w-8 text-right text-lg font-semibold tabular-nums">
                  {row.skipped ? "\u2014" : row.rating}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending} pendingLabel="Saving…" disabled={allSkipped}>
          Save my votes
        </Button>
        <span className="text-sm text-neutral-500">
          {toRateCount} to rate · {ballot.length - toRateCount} skipped
        </span>
      </div>

      {allSkipped ? (
        <p className="mt-2 text-xs text-neutral-500">
          Rate at least one player (or clear a skip) to save.
        </p>
      ) : null}

      <FeedbackMessage ok={state.ok} message={state.message} className="mt-3" />
    </form>
  );
}
