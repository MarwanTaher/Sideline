"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptTermsAction,
  seasonWaitlistAction,
  withdrawAction,
  type SubscriptionActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: SubscriptionActionState = { ok: false, message: "" };

export function AcceptTerms({
  seasonId,
  spotsLeft,
  signupOpen,
}: {
  seasonId: number;
  spotsLeft: number;
  signupOpen: boolean;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [state, formAction, pending] = useActionState(acceptTermsAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!signupOpen) {
    return (
      <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:bg-neutral-900">
        Sign-up for this season is closed. Speak to an admin if you want a place.
      </p>
    );
  }

  if (spotsLeft <= 0) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        All core places are taken. You can still vote in or out each week to fill
        the remaining places on matchday.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="seasonId" value={seasonId} />
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="agree"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/20 dark:border-white/20"
        />
        <span>
          I have read and accept the rules above, and I commit to the season
          subscription and its monthly payments.
        </span>
      </label>
      <Button type="submit" disabled={!agreed} pending={pending} pendingLabel="Confirming…">
        Accept and take my place
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} />
    </form>
  );
}

export function WithdrawButton({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(withdrawAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Give up my place
        </button>
        <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-xl border border-amber-500/40 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <input type="hidden" name="seasonId" value={seasonId} />
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Giving up your place frees it for someone else. Anything already due for
        this season still has to be settled with the admins.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" variant="danger" pending={pending} pendingLabel="Releasing…">
          Yes, give up my place
        </Button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-sm text-neutral-500 underline underline-offset-2"
        >
          Cancel
        </button>
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-2" />
    </form>
  );
}

export function SeasonWaitlistButton({
  seasonId,
  position,
}: {
  seasonId: number;
  position: number | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(seasonWaitlistAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="mt-3">
      <form action={formAction}>
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="intent" value={position == null ? "join" : "leave"} />
        <Button
          type="submit"
          variant="secondary"
          pending={pending}
          pendingLabel="Saving…"
        >
          {position == null ? "Join the season reserve list" : `Leave reserve list (#${position})`}
        </Button>
      </form>
      <p className="mt-1 text-xs text-neutral-500">
        If a place opens, the next person in order gets a push offer. You still
        need to review and accept the season rules before joining.
      </p>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-1" />
    </div>
  );
}
