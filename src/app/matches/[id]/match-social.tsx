"use client";

import { useActionState } from "react";
import type { ReactionSummaryItem } from "@/lib/reactions";
import { ShareButton } from "@/components/share-button";
import { reactAction, type SocialActionState } from "./social/actions";

const INITIAL: SocialActionState = { ok: false, message: "" };

export interface MatchSocialProps {
  matchId: number;
  canInteract: boolean;
  reactions: ReactionSummaryItem[];
  shareText: string;
  shareUrl: string;
  icsHref: string;
}

export function MatchSocial({
  matchId,
  canInteract,
  reactions,
  shareText,
  shareUrl,
  icsHref,
}: MatchSocialProps) {
  const [reactState, reactFormAction, reactPending] = useActionState(reactAction, INITIAL);

  const totalReactions = reactions.reduce((a, r) => a + r.count, 0);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Match hub</h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ShareButton text={shareText} title="Match result" url={shareUrl} />
        <a
          href={icsHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          📅 Add to calendar
        </a>
      </div>

      {/* Reactions — bounded banter; discussion lives in the WhatsApp group. */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Reactions</h3>
          <span className="text-xs text-neutral-400">{totalReactions} total</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {reactions.map((r) => (
            <form key={r.emoji} action={reactFormAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="emoji" value={r.emoji} />
              <button
                type="submit"
                disabled={!canInteract || reactPending}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition disabled:opacity-50 ${
                  r.mine
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-black/10 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-900"
                }`}
                title={
                  r.reactors.length > 0
                    ? r.reactors.join(", ")
                    : canInteract
                      ? "Tap to react"
                      : "Only players in this match can react"
                }
              >
                <span className="text-base leading-none">{r.emoji}</span>
                {r.count > 0 ? <span className="text-xs font-medium">{r.count}</span> : null}
              </button>
            </form>
          ))}
        </div>
        {/* Who reacted — reactions are attributed, not anonymous. */}
        {reactions.some((r) => r.reactors.length > 0) ? (
          <ul className="mt-3 space-y-1">
            {reactions
              .filter((r) => r.reactors.length > 0)
              .map((r) => (
                <li key={r.emoji} className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="min-w-0">{r.reactors.join(", ")}</span>
                </li>
              ))}
          </ul>
        ) : null}
        {reactState.message ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{reactState.message}</p>
        ) : null}
      </div>
    </section>
  );
}
