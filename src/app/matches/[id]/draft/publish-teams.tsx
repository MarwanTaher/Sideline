"use client";

import { useActionState } from "react";
import { publishTeamsAction, type DraftActionState } from "./actions";

const INITIAL: DraftActionState = { ok: false, message: "" };

/** Reveal the saved teams to players (pop-up + push). */
export function PublishTeams({ matchId, publishedAt }: { matchId: number; publishedAt: string | null }) {
  const [state, action, pending] = useActionState(publishTeamsAction, INITIAL);
  const published = state.ok || publishedAt != null;

  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{published ? "Teams published" : "Ready to reveal?"}</p>
        <p className="text-xs text-neutral-500">
          {state.message ||
            (published
              ? "Re-publish after changes so players see their new side."
              : "Save the lineup, then publish: every player gets a team-reveal pop-up and a push.")}
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Publishing…" : published ? "Re-publish" : "🎽 Publish teams"}
      </button>
    </form>
  );
}
