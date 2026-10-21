"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const STORY_MS = 6000;
/** A press longer than this is a "hold to pause", not a tap. */
const TAP_MS = 250;

/**
 * Full-screen, Instagram-style story viewer: timed progress bars, tap right/left
 * to move, press-and-hold to pause, ✕ / Esc to close.
 */
export function StoryDeck({ children, closeHref }: { children: ReactNode; closeHref: string }) {
  const cards = Children.toArray(children);
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const downAt = useRef(0);
  const last = cards.length - 1;

  const go = useCallback((n: number) => setIdx(Math.max(0, Math.min(last, n))), [last]);
  const close = useCallback(() => router.push(closeHref), [router, closeHref]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(last, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close, last]);

  const interactive = (t: EventTarget | null) => (t as HTMLElement | null)?.closest("a,button") != null;

  function onPointerDown(e: React.PointerEvent) {
    if (interactive(e.target)) return;
    downAt.current = performance.now();
    setPaused(true);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (interactive(e.target)) return;
    setPaused(false);
    if (performance.now() - downAt.current > TAP_MS) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) go(idx - 1);
    else go(idx + 1);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black">
      <div
        className="relative h-full w-full max-w-md select-none overflow-hidden sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setPaused(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div key={idx} className="story-in absolute inset-0">
          {cards[idx]}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/40 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex gap-1">
            {cards.map((_, i) => (
              <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                {i < idx ? <span className="block h-full w-full bg-white" /> : null}
                {i === idx ? (
                  <span
                    key={idx}
                    className="story-progress block h-full bg-white"
                    style={{
                      animationDuration: `${STORY_MS}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                    onAnimationEnd={() => {
                      if (idx < last) go(idx + 1);
                    }}
                  />
                ) : null}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Close recap"
          className="absolute right-2 top-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))] z-20 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-white/90 transition hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
