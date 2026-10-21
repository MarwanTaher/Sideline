"use client";

import { useState, useTransition } from "react";
import { setFunMessagesAction } from "./actions";

/** Opt in/out of cheeky "bummer" pop-ups after a rough game. */
export function FunMessagesToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setFunMessagesAction(next);
      if (!res.ok) setOn(!next);
    });
  };

  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">Fun messages</span>
        <span className="block text-xs text-neutral-500">
          Light-hearted pop-ups after a rough game (always private, at most one every two weeks).
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={toggle}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
