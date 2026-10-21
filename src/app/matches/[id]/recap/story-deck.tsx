"use client";

import { Children, useRef, useState, type ReactNode } from "react";

/** Horizontal swipe deck (scroll-snap) with progress dots and prev/next. */
export function StoryDeck({ children }: { children: ReactNode }) {
  const cards = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(i);
  }

  function go(i: number) {
    const el = ref.current;
    if (!el) return;
    const n = Math.max(0, Math.min(cards.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div className="mb-3 flex gap-1.5" aria-hidden>
        {cards.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= idx ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-800"}`}
          />
        ))}
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => (
          <div key={i} className="w-full shrink-0 snap-center px-0.5">
            {c}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          className="rounded-xl px-3 py-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900 disabled:opacity-30 dark:hover:text-neutral-100"
        >
          ← Back
        </button>
        <span className="text-xs tabular-nums text-neutral-400">
          {idx + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={() => go(idx + 1)}
          disabled={idx === cards.length - 1}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
