"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { playerSetAllPaidAction } from "@/app/matches/[id]/payments/actions";
import { declareAllPaidAction } from "@/app/admin/accounts/billing-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

type State = { ok: boolean; message: string };
const INITIAL: State = { ok: false, message: "" };

function useRefreshOnOk(state: State) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

/** Normal-match pot: one trusted "I've paid" for the player and their guests. */
export function SharePaidButton({ matchId, paid }: { matchId: number; paid: boolean }) {
  const [state, action, pending] = useActionState(playerSetAllPaidAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      <Button type="submit" size="sm" variant={paid ? "ghost" : "success"} pending={pending} pendingLabel="…">
        {paid ? "Undo" : "I've paid"}
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-1" />
    </form>
  );
}

/** Season invoices: "I've sent it" for every open bill, or undo; an admin confirms. */
export function SeasonSentButton({ seasonId, declared }: { seasonId: number; declared: boolean }) {
  const [state, action, pending] = useActionState(declareAllPaidAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="declared" value={declared ? "false" : "true"} />
      <Button type="submit" size="sm" variant={declared ? "ghost" : "primary"} pending={pending} pendingLabel="…">
        {declared ? "Undo" : "I've sent it"}
      </Button>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-1" />
    </form>
  );
}
