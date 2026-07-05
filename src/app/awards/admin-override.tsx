"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AwardType, ActivePlayer } from "@/lib/awards";
import {
  applyOverrideAction,
  clearOverrideAction,
  type OverrideActionState,
} from "./actions";

const INITIAL: OverrideActionState = { ok: false, message: "" };

export interface OverrideItem {
  awardType: AwardType;
  label: string;
  currentWinnerIds: number[];
  isOverride: boolean;
}

function OverrideRow({
  item,
  scope,
  matchId,
  players,
}: {
  item: OverrideItem;
  scope: "match" | "overall";
  matchId: number | null;
  players: ActivePlayer[];
}) {
  const router = useRouter();
  const [applyState, applyAction, applyPending] = useActionState(
    applyOverrideAction,
    INITIAL,
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearOverrideAction,
    INITIAL,
  );

  useEffect(() => {
    if (applyState.ok || clearState.ok) router.refresh();
  }, [applyState, clearState, router]);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{item.label}</h3>
        {item.isOverride ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            overridden
          </span>
        ) : null}
      </div>

      <form action={applyAction} className="mt-3 space-y-2">
        <input type="hidden" name="scope" value={scope} />
        {scope === "match" && matchId != null ? (
          <input type="hidden" name="matchId" value={matchId} />
        ) : null}
        <input type="hidden" name="awardType" value={item.awardType} />

        <label className="block text-xs font-medium text-neutral-500">
          Winner(s)
          <select
            name="winnerIds"
            multiple
            defaultValue={item.currentWinnerIds.map(String)}
            className="mt-1 block h-32 w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:border-white/15 dark:bg-neutral-900"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (#{p.id})
              </option>
            ))}
          </select>
        </label>

        <input
          type="text"
          name="reason"
          placeholder="Reason (required)"
          className="block w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={applyPending}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {applyPending ? "Applying…" : "Apply override"}
          </button>
        </div>
        {applyState.message ? (
          <p
            className={`text-xs ${
              applyState.ok ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {applyState.message}
          </p>
        ) : null}
      </form>

      <form action={clearAction} className="mt-2">
        <input type="hidden" name="scope" value={scope} />
        {scope === "match" && matchId != null ? (
          <input type="hidden" name="matchId" value={matchId} />
        ) : null}
        <input type="hidden" name="awardType" value={item.awardType} />
        <button
          type="submit"
          disabled={clearPending}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium transition hover:bg-neutral-50 disabled:opacity-50 dark:border-white/15 dark:hover:bg-neutral-800"
        >
          {clearPending ? "Clearing…" : "Clear override"}
        </button>
        {clearState.message ? (
          <p
            className={`mt-1 text-xs ${
              clearState.ok ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {clearState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

export default function AdminOverridePanel({
  items,
  scope,
  matchId,
  players,
}: {
  items: OverrideItem[];
  scope: "match" | "overall";
  matchId: number | null;
  players: ActivePlayer[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Manual override</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Admin only. Overrides replace computed winners for this scope and are
        recorded in the audit log. A reason is required.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <OverrideRow
            key={item.awardType}
            item={item}
            scope={scope}
            matchId={matchId}
            players={players}
          />
        ))}
      </div>
    </section>
  );
}
