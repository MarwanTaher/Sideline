"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  SeasonSubscription,
  SeasonWaitlistPlayer,
  SubscriptionSeason,
} from "@/lib/season-subscriptions";
import type { SeasonGoLiveChecklist } from "@/lib/season-billing";
import { SEASON_PAYMENT_REMINDER_COPY } from "@/lib/season-calculations";
import {
  saveSubscriptionSettingsAction,
  addSubscriberAction,
  removeSubscriberAction,
  removeSeasonWaitlistPlayerAction,
  setSeasonGoLiveCheckAction,
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
  waitlist,
  goLiveChecklist,
}: {
  season: SubscriptionSeason;
  subscribers: SeasonSubscription[];
  candidates: { id: number; name: string }[];
  waitlist: SeasonWaitlistPlayer[];
  goLiveChecklist: SeasonGoLiveChecklist | null;
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

      {goLiveChecklist ? (
        <GoLiveChecklist seasonId={season.id} checklist={goLiveChecklist} />
      ) : null}

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

      <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/5">
        <h3 className="text-sm font-medium">Season reserve list ({waitlist.length})</h3>
        <p className="mt-1 text-xs text-neutral-500">
          When a core subscriber withdraws, the first eligible person gets a
          targeted push offer. They still need to accept the terms.
        </p>
        {waitlist.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nobody is waiting.</p>
        ) : (
          <ol className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {waitlist.map((player, index) => (
              <WaitlistRow
                key={player.playerId}
                seasonId={season.id}
                index={index}
                player={player}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function GoLiveChecklist({
  seasonId,
  checklist,
}: {
  seasonId: number;
  checklist: SeasonGoLiveChecklist;
}) {
  const checks = [
    { key: "transferDetailsComplete", label: "Transfer recipient and account details are filled", done: checklist.transferDetailsComplete },
    { key: "ratesConfirmed", label: "Rates and due day are confirmed", done: checklist.ratesConfirmed, manual: true },
    { key: "termsFinal", label: "Season terms are final", done: checklist.termsFinal, manual: true },
    { key: "testInvoiceCompleted", label: "Test invoice generated, reviewed and deleted", done: checklist.testInvoiceCompleted, manual: true },
    { key: "reminderTextReviewed", label: "Payment reminder copy reviewed", done: checklist.reminderTextReviewed, manual: true },
  ] as const;

  return (
    <section className="mt-4 rounded-xl border border-amber-500/30 bg-amber-50/40 p-3 dark:bg-amber-950/20">
      <h3 className="text-sm font-semibold">
        Go-live checklist {checklist.complete ? "· ready" : "· required before release"}
      </h3>
      <ul className="mt-2 space-y-2">
        {checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={check.done ? "text-emerald-700" : "text-amber-700"}>
              {check.done ? "✓" : "○"}
            </span>
            <span className="flex-1">{check.label}</span>
            {"manual" in check ? (
              <ChecklistConfirmation
                seasonId={seasonId}
                check={check.key}
                done={check.done}
              />
            ) : (
              <span className="text-xs text-neutral-500">{check.done ? "complete" : "missing"}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-white/70 px-2.5 py-2 text-xs text-neutral-600 dark:bg-neutral-900/60 dark:text-neutral-300">
        Reminder copy (3 days): “{SEASON_PAYMENT_REMINDER_COPY.threeDays}” Due day:
        “{SEASON_PAYMENT_REMINDER_COPY.today}”
      </p>
    </section>
  );
}

function ChecklistConfirmation({
  seasonId,
  check,
  done,
}: {
  seasonId: number;
  check: "ratesConfirmed" | "termsFinal" | "testInvoiceCompleted" | "reminderTextReviewed";
  done: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setSeasonGoLiveCheckAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="check" value={check} />
        <input type="hidden" name="checked" value={done ? "false" : "true"} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs font-medium text-blue-700 underline underline-offset-2 disabled:opacity-50 dark:text-blue-300"
        >
          {pending ? "Saving…" : done ? "Undo" : "Confirm"}
        </button>
      </form>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-1 max-w-52 text-xs" />
    </div>
  );
}

function WaitlistRow({
  seasonId,
  index,
  player,
}: {
  seasonId: number;
  index: number;
  player: SeasonWaitlistPlayer;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(removeSeasonWaitlistPlayerAction, INITIAL);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span>{index + 1}. {player.name}</span>
      <form action={formAction}>
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="playerId" value={player.playerId} />
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="…">
          Remove
        </Button>
      </form>
    </li>
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
