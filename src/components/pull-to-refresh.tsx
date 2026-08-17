"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Pull-to-refresh for the installed (standalone) app, where the browser's own
 * pull-to-refresh is unavailable. Only activates in standalone display mode;
 * in a normal browser tab the native gesture is left alone. Pulling down from
 * the top past the threshold triggers a soft router refresh (re-fetches server
 * data without a full reload).
 */
export default function PullToRefresh() {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const offsetRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const MAX = 96;
    const THRESHOLD = 64;

    const set = (v: number) => {
      offsetRef.current = v;
      setOffset(v);
    };

    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    function onStart(e: TouchEvent) {
      if (refreshingRef.current || !atTop()) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }

    function onMove(e: TouchEvent) {
      if (!pulling.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (offsetRef.current !== 0) set(0);
        pulling.current = atTop();
        return;
      }
      // Rubber-band resistance, capped.
      set(Math.min(MAX, dy * 0.5));
      if (e.cancelable) e.preventDefault();
    }

    function onEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      if (offsetRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        set(44);
        router.refresh();
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          set(0);
        }, 900);
      } else {
        set(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const visible = offset > 0 || refreshing;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] flex justify-center md:hidden"
      style={{
        transform: `translateY(${Math.max(0, offset - 24)}px)`,
        opacity: visible ? 1 : 0,
        transition: pulling.current ? "none" : "transform 0.2s ease, opacity 0.2s ease",
      }}
    >
      <div className="mt-3 rounded-full bg-white p-2 shadow-md ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 text-emerald-600 dark:text-emerald-400 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${offset * 3}deg)` }}
          fill="none"
        >
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
