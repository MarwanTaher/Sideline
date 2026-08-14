"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { submitStatsAction, type StatsSubmitState } from "./actions";
import type { PlayerStatDefault } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: StatsSubmitState = { ok: false, message: "" };

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const STATUS_NEXT: Record<string, string> = {
  pending: "Pending admin review.",
  approved: "Approved — counts toward scoring.",
  rejected: "Rejected — you can edit and resubmit.",
};

export interface StatsFormProps {
  matchId: number;
  open: boolean;
  current: PlayerStatDefault | null;
}

export function StatsForm({ matchId, open, current }: StatsFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitStatsAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const statusLabel = current?.status;

  return (
    <div className="rounded-2xl border border-black/[0.06] p-4 shadow-sm dark:border-white/10">
      {current ? (
        <div className="mb-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-500">Your current entry:</span>
            <span className="font-medium">
              {current.goals} goal{current.goals === 1 ? "" : "s"} · {current.assists} assist
              {current.assists === 1 ? "" : "s"}
            </span>
            {statusLabel ? (
              <Badge tone={STATUS_TONE[statusLabel] ?? "neutral"} dot>
                {statusLabel}
              </Badge>
            ) : null}
          </div>
          {statusLabel && STATUS_NEXT[statusLabel] ? (
            <p className="text-xs text-neutral-500">{STATUS_NEXT[statusLabel]}</p>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 text-sm text-neutral-500">You have not submitted stats yet.</p>
      )}

      {open ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Goals</span>
              <input
                type="number"
                name="goals"
                min={0}
                max={50}
                step={1}
                defaultValue={current?.goals ?? 0}
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
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
                defaultValue={current?.assists ?? 0}
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
              />
            </label>
          </div>

          <FeedbackMessage ok={state.ok} message={state.message} />

          <Button
            type="submit"
            pending={pending}
            pendingLabel="Submitting…"
          >
            {current ? "Update submission" : "Submit stats"}
          </Button>
          <p className="text-xs text-neutral-500">
            Submitting sends your goals and assists to an admin for review.
          </p>
        </form>
      ) : (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          Stat submissions are closed for this match.
        </p>
      )}
    </div>
  );
}
