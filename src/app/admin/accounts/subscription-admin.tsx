"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SeasonSubscription, SubscriptionSeason } from "@/lib/season-subscriptions";
import {
  saveSubscriptionSettingsAction,
  addSubscriberAction,
  removeSubscriberAction,
  type SubscriptionAdminState,
} from "./subscription-actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: SubscriptionAdminState = { ok: false, message: "" };

const inputCls =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export default function SubscriptionAdmin({
  season,
  subscribers,
  candidates,
}: {
  season: SubscriptionSeason;
  subscribers: SeasonSubscription[];
  candidates: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveSubscriptionSettingsAction,
    INITIAL,
  );
  const [addState, addAction, addPending] = useActionState(addSubscriberAction, INITIAL);

  useEffect(() => {
    if (state.ok || addState.ok) router.refresh();
  }, [state, addState, router]);

  const spotsLeft = Math.max(0, season.subscriberCap - subscribers.length);

  return (
    <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Season subscription — {season.name}</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Core subscribers are marked IN automatically for every match inside the
        season dates. Accepting the terms secures a place; payment is tracked
        separately.
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="seasonId" value={season.id} />

        <div
          className={`rounded-xl border p-3 ${
            season.visibleToPlayers
              ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
              : "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20"
          }`}
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="visibleToPlayers"
              defaultChecked={season.visibleToPlayers}
              className="mt-0.5 h-4 w-4 rounded border-black/20 dark:border-white/20"
            />
            <span>
              <strong>Visible to players</strong>
              <span className="block text-xs text-neutral-600 dark:text-neutral-300">
                {season.visibleToPlayers
                  ? "Players can see the season page, the rules and the sign-up."
                  : "Draft — only admins can see it. Nothing appears in the menu, on the dashboard, or at /season for players."}
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="subscriptionEnabled"
              defaultChecked={season.subscriptionEnabled}
              className="h-4 w-4 rounded border-black/20 dark:border-white/20"
            />
            Subscription season
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="signupOpen"
              defaultChecked={season.signupOpen}
              className="h-4 w-4 rounded border-black/20 dark:border-white/20"
            />
            Sign-up open
          </label>
        </div>
        <label className="block sm:max-w-40">
          <span className="text-xs text-neutral-500">Core places</span>
          <input
            name="subscriberCap"
            type="number"
            min={1}
            max={40}
            defaultValue={season.subscriberCap}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">
            Rules players must accept (plain text, shown on the season page)
          </span>
          <textarea
            name="terms"
            rows={10}
            defaultValue={season.terms}
            className={`${inputCls} font-mono text-xs`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="bumpTermsVersion"
            className="h-4 w-4 rounded border-black/20 dark:border-white/20"
          />
          Rules changed materially — bump the version (currently v
          {season.termsVersion})
        </label>
        <Button type="submit" pending={pending} pendingLabel="Saving…">
          Save subscription settings
        </Button>
        <FeedbackMessage ok={state.ok} message={state.message} />
      </form>

      <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/5">
        <h3 className="text-sm font-medium">
          Core group ({subscribers.length}/{season.subscriberCap})
          {spotsLeft > 0 ? (
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {spotsLeft} free
            </span>
          ) : (
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              full
            </span>
          )}
        </h3>

        {subscribers.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nobody has committed yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {subscribers.map((s, i) => (
              <SubscriberRow key={s.playerId} index={i} seasonId={season.id} sub={s} />
            ))}
          </ol>
        )}

        <form action={addAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="seasonId" value={season.id} />
          <label className="min-w-48 flex-1">
            <span className="text-xs text-neutral-500">Add a player directly</span>
            <select name="playerId" defaultValue="" className={inputCls}>
              <option value="" disabled>
                Choose a player…
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary" pending={addPending} pendingLabel="Adding…">
            Add
          </Button>
        </form>
        <FeedbackMessage ok={addState.ok} message={addState.message} className="mt-2" />
      </div>
    </section>
  );
}

function SubscriberRow({
  index,
  seasonId,
  sub,
}: {
  index: number;
  seasonId: number;
  sub: SeasonSubscription;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(removeSubscriberAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="w-5 shrink-0 text-right tabular-nums text-neutral-400">
          {index + 1}
        </span>
        <Avatar name={sub.name} photoUrl={sub.photoUrl} size="xs" />
        <div className="min-w-0">
          <p className="truncate font-medium">{sub.name}</p>
          <p className="text-xs text-neutral-500">
            {new Date(sub.acceptedAt).toLocaleDateString()} · terms v
            {sub.acceptedTermsVersion}
          </p>
        </div>
      </div>
      <form action={formAction}>
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="playerId" value={sub.playerId} />
        <Button type="submit" variant="danger" pending={pending} pendingLabel="…">
          Remove
        </Button>
      </form>
    </li>
  );
}
