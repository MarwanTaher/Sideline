"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { submitVotesAction, type VoteActionState } from "./actions";
import {
  DEFAULT_RATING,
  RATING_LABELS,
  ratingLabel,
  ratingTier,
} from "@/lib/voting-constants";
import type { BallotPlayer } from "@/lib/voting";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { RatingSlider } from "@/components/ui/rating-slider";
import { Banner, FeedbackMessage } from "@/components/ui/banner";

const INITIAL: VoteActionState = { ok: false, message: "" };

// Tailwind background classes per rating tier, used for the legend dots and the
// live descriptor chip.
const TIER_DOT: Record<string, string> = {
  low: "bg-red-500",
  mid: "bg-amber-500",
  high: "bg-lime-600",
  elite: "bg-emerald-500",
};

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
          Drag each slider from <span className="font-medium">0</span> to{" "}
          <span className="font-medium">10</span>. Each number has a meaning —
          see the scale below. Use &ldquo;Skip&rdquo; for players you can&rsquo;t
          rate.
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

      <details className="mt-3 rounded-xl border border-black/10 p-3 text-xs dark:border-white/10">
        <summary className="cursor-pointer font-medium text-neutral-600 dark:text-neutral-300">
          Rating scale — what each number means
        </summary>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {Object.entries(RATING_LABELS).map(([value, label]) => (
            <li key={value} className="flex items-center gap-2">
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${TIER_DOT[ratingTier(Number(value))]}`}
              >
                {value}
              </span>
              <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
            </li>
          ))}
        </ul>
      </details>

      <ul className="mt-3 space-y-2">
        {ballot.map((b) => {
          const row = rows[b.playerId] ?? { rating: DEFAULT_RATING, skipped: false };
          return (
            <li
              key={b.playerId}
              className={`rounded-2xl border p-3 shadow-sm transition ${
                row.skipped
                  ? "border-black/5 bg-neutral-50 dark:border-white/5 dark:bg-neutral-900"
                  : "border-black/[0.06] bg-white dark:border-white/10 dark:bg-neutral-900"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={b.name} photoUrl={b.photoUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="text-xs text-neutral-400">Team {b.teamNo}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSkipped(b.playerId, !row.skipped)}
                  className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    row.skipped
                      ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
                      : "border-black/15 text-neutral-500 dark:border-white/15"
                  }`}
                >
                  {row.skipped ? "Rate" : "Skip"}
                </button>
              </div>
              {row.skipped ? (
                <p className="mt-2 text-xs text-neutral-400">Skipped — not counted.</p>
              ) : (
                <div className="mt-3">
                  <RatingSlider value={row.rating} onChange={(v) => setRating(b.playerId, v)} />
                  <div className="mt-1 flex justify-center">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${TIER_DOT[ratingTier(row.rating)]}`}
                    >
                      {ratingLabel(row.rating)}
                    </span>
                  </div>
                </div>
              )}
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
