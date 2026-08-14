"use client";

import { useActionState } from "react";
import type { MotmTallyRow } from "@/lib/motm";
import { castMotmAction, type SocialActionState } from "../social/actions";
import { TrophyIcon } from "@/components/ui/icons";

const INITIAL: SocialActionState = { ok: false, message: "" };

export interface MotmVoteProps {
  matchId: number;
  candidates: { playerId: number; name: string }[];
  myVote: number | null;
  tally: MotmTallyRow[];
  voteCount: number;
  canVote: boolean;
  /** Only admins see the running tally; players vote blind. */
  showResults: boolean;
}

export function MotmVote({
  matchId,
  candidates,
  myVote,
  tally,
  voteCount,
  canVote,
  showResults,
}: MotmVoteProps) {
  const [state, action, pending] = useActionState(castMotmAction, INITIAL);

  return (
    <section className="mt-8 rounded-2xl border border-black/10 p-5 dark:border-white/10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Man of the Match</h2>
        {showResults ? (
          <span className="text-xs text-neutral-400">
            {voteCount} vote{voteCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Pick the one player who stood out — separate from your ratings above.
      </p>

      {canVote && candidates.length > 0 ? (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="matchId" value={matchId} />
          <select
            name="votedForId"
            defaultValue={myVote ?? ""}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
          >
            <option value="" disabled>
              Pick a player…
            </option>
            {candidates.map((c) => (
              <option key={c.playerId} value={c.playerId}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {myVote != null ? "Change vote" : "Vote"}
          </button>
        </form>
      ) : null}
      {state.message ? (
        <p
          className={`mt-2 text-xs ${state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {state.message}
        </p>
      ) : null}

      {showResults ? (
        tally.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {tally.map((t, i) => (
              <li key={t.playerId} className="flex items-center gap-2 text-sm">
                {i === 0 ? (
                  <TrophyIcon className="h-4 w-4 text-amber-500" />
                ) : (
                  <span className="w-4 text-center text-neutral-400">{i + 1}</span>
                )}
                <span className={i === 0 ? "font-semibold" : ""}>{t.name}</span>
                <span className="ml-auto text-xs text-neutral-400">
                  {t.votes} vote{t.votes === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">No MOTM votes yet.</p>
        )
      ) : myVote != null ? (
        <p className="mt-3 text-sm text-neutral-500">
          Your vote is in. Results stay hidden until the admin shares them.
        </p>
      ) : null}
    </section>
  );
}
