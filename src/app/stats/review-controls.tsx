"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  approveSubmissionAction,
  rejectSubmissionAction,
  backfillStatsAction,
  type StatsReviewState,
} from "./actions";
import { fmtDate } from "@/lib/format";
import type { PendingSubmission } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: StatsReviewState = { ok: false, message: "" };

export function ReviewRow({ sub }: { sub: PendingSubmission }) {
  const router = useRouter();
  const [apState, apAction, apPending] = useActionState(approveSubmissionAction, INITIAL);
  const [rjState, rjAction, rjPending] = useActionState(rejectSubmissionAction, INITIAL);

  useEffect(() => {
    if (apState.ok || rjState.ok) router.refresh();
  }, [apState, rjState, router]);

  return (
    <li className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{sub.name}</span>
          <span className="ml-2 text-sm text-neutral-500">
            Match {sub.matchId} · {fmtDate(sub.playedOn)}
          </span>
        </div>
      </div>

      {/* Approve form (admin can edit goals/assists before approving). */}
      <form action={apAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="submissionId" value={sub.id} />
        <label className="block text-sm">
          <span className="font-medium">Goals</span>
          <input
            type="number"
            name="goals"
            min={0}
            max={50}
            step={1}
            defaultValue={sub.goals}
            className="mt-1 w-20 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Assists</span>
          <input
            type="number"
            name="assists"
            min={0}
            max={50}
            step={1}
            defaultValue={sub.assists}
            className="mt-1 w-20 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          />
        </label>
        <Button type="submit" variant="success" pending={apPending} pendingLabel="Approving…">
          Save &amp; approve
        </Button>
      </form>

      {/* Reject form. */}
      <form action={rjAction} className="mt-2">
        <input type="hidden" name="submissionId" value={sub.id} />
        <Button type="submit" variant="secondary" size="sm" pending={rjPending} pendingLabel="Rejecting…">
          Reject
        </Button>
      </form>

      <FeedbackMessage
        ok={apState.message ? apState.ok : rjState.ok}
        message={apState.message || rjState.message}
        className="mt-2"
      />
    </li>
  );
}

export function BackfillPanel() {
  const router = useRouter();
  const [state, action, pending] = useActionState(backfillStatsAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="mt-8 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-semibold">Backfill approved stats</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Rebuilds the stats table from every approved submission and enables stats scoring on
        those matches. Type <span className="font-mono font-semibold">BACKFILL</span> to confirm.
      </p>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="confirm"
          placeholder="BACKFILL"
          autoComplete="off"
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
        />
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Running…">
          Run backfill
        </Button>
      </form>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}
