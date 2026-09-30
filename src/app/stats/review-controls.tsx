"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  approveSubmissionAction,
  rejectSubmissionAction,
  backfillStatsAction,
  approveAllPendingAction,
  saveTrustedSettingsAction,
  type StatsReviewState,
} from "./actions";
import { matchLabel } from "@/lib/format";
import type { PendingSubmission } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: StatsReviewState = { ok: false, message: "" };

export function StatsMatchPicker({
  matches,
  selectedMatchId,
}: {
  matches: { id: number; label: string }[];
  selectedMatchId: number;
}) {
  const router = useRouter();
  return (
    <label className="block text-sm">
      <span className="font-medium">Match</span>
      <select
        value={selectedMatchId}
        onChange={(e) => router.push(`/stats?match=${e.target.value}`)}
        className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
      >
        <option value={0}>Select a match…</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReviewRow({ sub }: { sub: PendingSubmission }) {
  const router = useRouter();
  const [apState, apAction, apPending] = useActionState(approveSubmissionAction, INITIAL);
  const [rjState, rjAction, rjPending] = useActionState(rejectSubmissionAction, INITIAL);

  useEffect(() => {
    if (apState.ok || rjState.ok) router.refresh();
  }, [apState, rjState, router]);

  return (
        <li className="rounded-2xl border border-black/[0.06] p-4 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{sub.name}</span>
          <span className="ml-2 text-sm text-neutral-500">
            {matchLabel(sub.playedOn)}
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

export function ApproveAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(approveAllPendingAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="success"
        size="sm"
        pending={pending}
        pendingLabel="Approving…"
        disabled={count === 0}
      >
        Approve all ({count})
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} />
    </form>
  );
}

export function TrustedSettingsPanel({
  players,
  trustedIds,
  autoApprove,
}: {
  players: { id: number; name: string }[];
  trustedIds: number[];
  autoApprove: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveTrustedSettingsAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const trusted = new Set(trustedIds);

  return (
    <div className="mt-8 rounded-2xl border border-black/[0.06] p-4 shadow-sm dark:border-white/10">
      <h2 className="text-sm font-semibold">Trusted players</h2>
      <p className="mt-1 text-xs text-neutral-500">
        When auto-approval is on, stats submitted by trusted players are approved
        instantly (with a full audit trail). Stats never affect payments, so this
        is safe. Leave off to review everything manually.
      </p>
      <form action={action} className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="autoApprove"
            defaultChecked={autoApprove}
            className="h-4 w-4 rounded border-black/25 dark:border-white/25"
          />
          Auto-approve stats from trusted players
        </label>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-black/10 p-2 dark:border-white/10">
          {players.length === 0 ? (
            <p className="px-1 py-2 text-xs text-neutral-500">No active players.</p>
          ) : (
            <ul className="space-y-1">
              {players.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                    <input
                      type="checkbox"
                      name="trusted"
                      value={p.id}
                      defaultChecked={trusted.has(p.id)}
                      className="h-4 w-4 rounded border-black/25 dark:border-white/25"
                    />
                    {p.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Saving…">
          Save trusted settings
        </Button>
      </form>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}

export function BackfillPanel() {
  const router = useRouter();
  const [state, action, pending] = useActionState(backfillStatsAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="mt-8 rounded-2xl border border-black/[0.06] p-4 shadow-sm dark:border-white/10">
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
