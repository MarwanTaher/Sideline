"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { AwardMatch } from "@/lib/awards";
import { matchLabel } from "@/lib/format";

export default function AwardsControls({
  scope,
  matchId,
  matches,
}: {
  scope: "match" | "overall";
  matchId: number | null;
  matches: AwardMatch[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // Optimistic selections so the UI reacts instantly, before the server
  // finishes re-rendering the (heavier) awards content.
  const [pendingScope, setPendingScope] = useState<"match" | "overall" | null>(null);
  const [pendingMatch, setPendingMatch] = useState<number | null>(null);

  const activeScope = pendingScope ?? scope;
  const activeMatch = pendingMatch ?? matchId ?? matches[0]?.id ?? null;

  const setScope = useCallback(
    (next: "match" | "overall") => {
      if (next === activeScope) return;
      setPendingScope(next);
      const sp = new URLSearchParams(params.toString());
      sp.set("scope", next);
      if (next === "overall") {
        sp.delete("match");
      } else if (!sp.get("match") && matches.length > 0) {
        sp.set("match", String(matches[0].id));
      }
      startTransition(() => {
        router.push(`/awards?${sp.toString()}`);
      });
    },
    [activeScope, params, router, matches],
  );

  const setMatch = useCallback(
    (id: string) => {
      setPendingScope("match");
      setPendingMatch(Number(id));
      const sp = new URLSearchParams(params.toString());
      sp.set("scope", "match");
      sp.set("match", id);
      startTransition(() => {
        router.push(`/awards?${sp.toString()}`);
      });
    },
    [params, router],
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3" aria-busy={isPending}>
      <div className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/15">
        {(["overall", "match"] as const).map((s) => {
          const selected = activeScope === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
                selected
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {isPending && selected && pendingScope === s ? (
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              ) : null}
              {s}
            </button>
          );
        })}
      </div>

      {activeScope === "match" && matches.length > 0 && (
        <select
          value={activeMatch ?? matches[0].id}
          onChange={(e) => setMatch(e.target.value)}
          disabled={isPending}
          className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-60 dark:border-white/15 dark:bg-neutral-900"
        >
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {matchLabel(m.played_on)}
            </option>
          ))}
        </select>
      )}

      {isPending ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          Loading…
        </span>
      ) : null}
    </div>
  );
}
