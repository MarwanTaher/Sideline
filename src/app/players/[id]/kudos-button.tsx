"use client";

import { useActionState, useOptimistic } from "react";
import { toggleKudosAction } from "./actions";

function ClapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v6" />
      <path d="M16 9.5a1.5 1.5 0 0 1 3 0V13a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L5 14.2a1.6 1.6 0 0 1 2.3-2.2L9 13.5" />
    </svg>
  );
}

export default function KudosButton({
  targetId,
  initialGiven,
  initialCount,
}: {
  targetId: number;
  initialGiven: boolean;
  initialCount: number;
}) {
  const [state, formAction, pending] = useActionState(toggleKudosAction, {
    ok: false,
    given: initialGiven,
  });
  const [shownGiven, setShownGiven] = useOptimistic(
    state.given ?? initialGiven,
  );

  // Givers other than the viewer stay fixed; the viewer adds/removes one.
  const base = initialCount - (initialGiven ? 1 : 0);
  const displayCount = base + (shownGiven ? 1 : 0);

  async function optimisticAction(formData: FormData) {
    setShownGiven(!shownGiven);
    return formAction(formData);
  }

  return (
    <form action={optimisticAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="targetId" value={targetId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={shownGiven}
        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.97] disabled:opacity-60 ${
          shownGiven
            ? "bg-emerald-600 text-white hover:bg-emerald-500"
            : "border border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
        }`}
      >
        <ClapIcon className="h-4 w-4" />
        {shownGiven ? "Kudos given" : "Give kudos"}
        <span className="tabular-nums opacity-80">· {displayCount}</span>
      </button>
      {state.error ? (
        <span className="text-xs text-rose-600 dark:text-rose-400">{state.error}</span>
      ) : null}
    </form>
  );
}
