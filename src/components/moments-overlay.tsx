"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Confetti } from "@/components/confetti";
import {
  momentView,
  type Moment,
  type MomentCopyOverrides,
  type MomentTone,
  type MomentView,
} from "@/lib/moment-copy";
import type { ReactNode } from "react";
import { markMomentsSeenAction } from "@/app/moments-actions";
import { playMomentSound, sillySoundsEnabled, stopMomentSound } from "@/lib/silly-sounds";

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
 * they open the app: confetti + haptics + a short sting for celebrations, a
 * softer card and a recorded crowd laugh for bummers. Everything shown is marked seen
 * when the stack is dismissed. `preview` (admin "Play") marks nothing and
 * keeps CTAs from navigating.
 */
export function MomentsOverlay({
  moments,
  overrides,
  name,
  preview = false,
  sound,
  onClose,
}: {
  moments: Moment[];
  overrides?: MomentCopyOverrides;
  name?: string;
  preview?: boolean;
  /** Force one sound (admin preview); random per tone otherwise. */
  sound?: string;
  onClose?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const marked = useRef(false);

  const current = moments[index];
  const view = current ? momentView(current, { overrides, name }) : null;
  const celebrate = view?.tone === "epic" || view?.tone === "good";

  const tone = view?.tone;
  const shownId = current?.id;
  useEffect(() => {
    if (closed) return;
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [closed]);
  useEffect(() => {
    if (!tone || closed) return;
    let active = true;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (tone === "epic") navigator.vibrate?.([30, 40, 60]);
      else if (tone === "good") navigator.vibrate?.(25);
    }
    if (preview || sillySoundsEnabled()) {
      void playMomentSound(tone, sound).then((played) => {
        if (active) setSoundBlocked(!played);
      });
    }
    return () => {
      active = false;
      stopMomentSound();
    };
  }, [tone, shownId, index, closed, preview, sound]);

  if (!current || !view || closed) return null;

  const finish = () => {
    setClosed(true);
    onClose?.();
    if (preview) return;
    if (!marked.current) {
      marked.current = true;
      void markMomentsSeenAction(moments.map((m) => m.id)).catch((error: unknown) => {
        console.error("Could not mark moments as seen.", error);
      });
    }
  };
  const next = () => (index + 1 < moments.length ? setIndex(index + 1) : finish());
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-end justify-center outline-none sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moment-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish();
        }
        if (event.key !== "Tab") return;
        const buttons = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href]",
        );
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <button type="button" aria-label="Dismiss" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={finish} />
      {celebrate ? <Confetti fire={index + 1} pieces={view.tone === "epic" ? 180 : 90} /> : null}
      <MomentCard
        key={current.id}
        view={view}
        titleId="moment-title"
        top={
          moments.length > 1 ? (
            <div className="mb-4 flex justify-center gap-1.5">
              {moments.map((m, i) => (
                <span key={m.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-emerald-500" : "w-1.5 bg-neutral-300 dark:bg-neutral-700"}`} />
              ))}
            </div>
          ) : null
        }
      >
        <div className="mt-6 flex flex-col gap-2">
          {soundBlocked ? (
            <button
              type="button"
              onClick={() => {
                void playMomentSound(view.tone, sound).then((played) => setSoundBlocked(!played));
              }}
              className="min-h-11 rounded-xl border border-black/10 px-4 py-2 text-sm dark:border-white/10"
            >
              Tap to play sound
            </button>
          ) : null}
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
              onClick={(e) => {
                if (preview) e.preventDefault();
                finish();
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              {view.cta.label}
            </Link>
          ) : null}
        </div>
      </MomentCard>
    </div>
  );
}

/** The pop-up card itself; also used by the admin Messages preview. */
export function MomentCard({
  view,
  top,
  children,
  animate = true,
  titleId,
}: {
  view: MomentView;
  titleId?: string;
  top?: ReactNode;
  children?: ReactNode;
  animate?: boolean;
}) {
  const style = TONE_STYLE[view.tone];
  return (
    <div
      className={`relative m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-black/10 p-6 text-center shadow-2xl ${animate ? "animate-[moment-pop_.45s_cubic-bezier(.2,1.4,.4,1)] motion-reduce:animate-none" : ""} dark:border-white/10 ${style.card}`}
    >
      {top}
      <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ring-4 ${style.badge}`}>
        <span className={animate && view.tone === "epic" ? "animate-bounce motion-reduce:animate-none" : ""}>{view.emoji}</span>
      </div>
      <h2 id={titleId} className="mt-4 text-2xl font-extrabold tracking-tight">
        {view.title}
      </h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{view.body}</p>
      {view.footnote ? (
        <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-neutral-900/60 dark:text-emerald-300">
          {view.footnote}
        </p>
      ) : null}
      {children}
    </div>
  );
}
