"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** A press longer than this is a "hold to pause", not a tap. */
const TAP_MS = 250;
/** Drag down this far to close. */
const SWIPE_CLOSE_PX = 90;

/**
 * Full-screen, Instagram-style story viewer: timed progress bars, tap right/left
 * to move, press-and-hold to pause, swipe down / ✕ / Esc to close.
 * Used by the matchday recap and by photo stories.
 */
export function StoryViewer({
  count,
  render,
  onClose,
  onIndex,
  onEnd,
  durationMs = 6000,
  hold = false,
  startIndex = 0,
  closeLabel = "Close",
}: {
  count: number;
  render: (index: number) => ReactNode;
  onClose: () => void;
  /** Called whenever the visible card changes (including the first). */
  onIndex?: (index: number) => void;
  /** Called when the last card's timer runs out (stays on it if omitted). */
  onEnd?: () => void;
  durationMs?: number;
  /** Pause from the outside, e.g. while a sheet is open. */
  hold?: boolean;
  startIndex?: number;
  closeLabel?: string;
}) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(count - 1, startIndex)));
  const [pressed, setPressed] = useState(false);
  const down = useRef({ at: 0, y: 0 });
  const last = count - 1;
  const paused = pressed || hold;

  const go = useCallback((n: number) => setIdx(Math.max(0, Math.min(last, n))), [last]);

  useEffect(() => {
    onIndex?.(idx);
  }, [idx, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
  }, [onClose, last]);

  const interactive = (t: EventTarget | null) => (t as HTMLElement | null)?.closest("a,button,input,textarea") != null;

  function onPointerDown(e: React.PointerEvent) {
    if (hold || interactive(e.target)) return;
    down.current = { at: performance.now(), y: e.clientY };
    setPressed(true);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pressed) return;
    setPressed(false);
    if (e.clientY - down.current.y > SWIPE_CLOSE_PX) return onClose();
    if (performance.now() - down.current.at > TAP_MS) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) go(idx - 1);
    else go(idx + 1);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black">
      <div
        className="relative h-full w-full max-w-md touch-none select-none overflow-hidden sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setPressed(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div key={idx} className="story-in absolute inset-0">
          {render(idx)}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/40 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex gap-1">
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                {i < idx ? <span className="block h-full w-full bg-white" /> : null}
                {i === idx ? (
                  <span
                    key={idx}
                    className="story-progress block h-full bg-white"
                    style={{
                      animationDuration: `${durationMs}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                    onAnimationEnd={() => {
                      if (idx < last) go(idx + 1);
                      else onEnd?.();
                    }}
                  />
                ) : null}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute right-2 top-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))] z-20 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-white/90 transition hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
