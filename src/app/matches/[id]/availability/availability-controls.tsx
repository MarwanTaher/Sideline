"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { setAvailabilityAction, type AvailabilityActionState } from "./actions";
import type { AvailabilityStatus } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Banner, FeedbackMessage } from "@/components/ui/banner";

const INITIAL: AvailabilityActionState = { ok: false, message: "" };

export interface AvailabilityControlsProps {
  matchId: number;
  currentStatus: AvailabilityStatus;
  open: boolean;
}

export function AvailabilityControls({
  matchId,
  currentStatus,
  open,
}: AvailabilityControlsProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setAvailabilityAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const banner =
    currentStatus === "in"
      ? { tone: "success" as const, text: "You are marked IN for this match." }
      : currentStatus === "out"
        ? { tone: "warning" as const, text: "You are marked OUT for this match." }
        : { tone: "info" as const, text: "You have not responded yet." };

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <Banner tone={banner.tone}>{banner.text}</Banner>

      {open ? (
        <div className="mt-3 flex gap-2">
          <form action={formAction} className="flex-1">
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="status" value="in" />
            <Button
              type="submit"
              variant="success"
              className="w-full"
              disabled={currentStatus === "in"}
              pending={pending}
              pendingLabel="Marking…"
            >
              <span aria-hidden="true">✅</span> Mark IN
            </Button>
          </form>
          <form action={formAction} className="flex-1">
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="status" value="out" />
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={currentStatus === "out"}
              pending={pending}
              pendingLabel="Marking…"
            >
              <span aria-hidden="true">❌</span> Mark OUT
            </Button>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Availability is closed for this match.</p>
      )}

      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </div>
  );
}
