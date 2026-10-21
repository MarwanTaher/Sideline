"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Confetti } from "@/components/confetti";
import { momentView, type Moment, type MomentTone } from "@/lib/moment-copy";
import { markMomentsSeenAction } from "@/app/moments-actions";

const TONE_STYLE: Record<MomentTone, { card: string; badge: string }> = {
  epic: {
    card: "bg-gradient-to-br from-amber-50 via-white to-emerald-50 dark:from-amber-950/40 dark:via-neutral-950 dark:to-emerald-950/40",
    badge: "bg-amber-400/20 ring-amber-400/50",
  },
  good: {
    card: "bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-neutral-950",
    badge: "bg-emerald-400/20 ring-emerald-400/40",
  },
  info: {
    card: "bg-white dark:bg-neutral-950",
    badge: "bg-sky-400/15 ring-sky-400/40",
  },
  bummer: {
    card: "bg-gradient-to-br from-slate-100 to-white dark:from-slate-900 dark:to-neutral-950",
    badge: "bg-slate-400/15 ring-slate-400/40",
  },
};

/**
 * Shows the player's unseen moments (max 3) one after another, the next time
 * they open the app: confetti + haptics for celebrations, a softer card for
 * bummers. Everything shown is marked seen when the stack is dismissed.
 */
export function MomentsOverlay({ moments }: { moments: Moment[] }) {
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState(false);
  const marked = useRef(false);

  const current = moments[index];
  const view = current ? momentView(current) : null;
  const celebrate = view?.tone === "epic" || view?.tone === "good";

  useEffect(() => {
    if (!view || closed) return;
    if (view.tone === "epic") navigator.vibrate?.([30, 40, 60]);
    else if (view.tone === "good") navigator.vibrate?.(25);
  }, [view, closed]);

  if (!current || !view || closed) return null;

  const finish = () => {
    setClosed(true);
    if (!marked.current) {
      marked.current = true;
      void markMomentsSeenAction(moments.map((m) => m.id)).catch(() => {});
    }
  };
  const next = () => (index + 1 < moments.length ? setIndex(index + 1) : finish());
  const style = TONE_STYLE[view.tone];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="moment-title">
      <button type="button" aria-label="Dismiss" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={finish} />
      {celebrate ? <Confetti fire={index + 1} pieces={view.tone === "epic" ? 180 : 90} /> : null}
      <div
        key={current.id}
        className={`relative m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-black/10 p-6 text-center shadow-2xl animate-[moment-pop_.45s_cubic-bezier(.2,1.4,.4,1)] motion-reduce:animate-none dark:border-white/10 ${style.card}`}
      >
        {moments.length > 1 ? (
          <div className="mb-4 flex justify-center gap-1.5">
            {moments.map((m, i) => (
              <span key={m.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-emerald-500" : "w-1.5 bg-neutral-300 dark:bg-neutral-700"}`} />
            ))}
          </div>
        ) : null}
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ring-4 ${style.badge}`}>
          <span className={view.tone === "epic" ? "animate-bounce motion-reduce:animate-none" : ""}>{view.emoji}</span>
        </div>
        <h2 id="moment-title" className="mt-4 text-2xl font-extrabold tracking-tight">
          {view.title}
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{view.body}</p>
        {view.footnote ? (
          <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-neutral-900/60 dark:text-emerald-300">
            {view.footnote}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={next}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            {index + 1 < moments.length ? "Next" : view.tone === "bummer" ? "Next week then 💪" : "Let's go!"}
          </button>
          {view.cta ? (
            <Link
              href={view.cta.href}
              onClick={finish}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              {view.cta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
