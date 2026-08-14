"use client";

import { useCallback, useRef, useState } from "react";

const TICKS = [0, 2, 4, 6, 8, 10];

/** Colour transitions: green ≥8 → emerald ≥6 → amber ≥4 → red. */
function colorFor(v: number): { hex: string; text: string } {
  if (v >= 8) return { hex: "#22c55e", text: "text-green-500" };
  if (v >= 6) return { hex: "#10b981", text: "text-emerald-500" };
  if (v >= 4) return { hex: "#f59e0b", text: "text-amber-500" };
  return { hex: "#ef4444", text: "text-red-500" };
}

/** Custom 0–10 rating slider (no native range input). 8px track, 22px glowing thumb. */
export function RatingSlider({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (v: number) => void;
  name?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const c = colorFor(value);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onChange(Math.round(ratio * 10));
    },
    [onChange],
  );

  return (
    <div className="select-none">
      <div className="mb-3 text-center">
        <span className={`font-heading text-[28px] font-extrabold leading-none tabular-nums ${c.text}`}>
          {value}
        </span>
        <span className="ml-1 text-sm text-neutral-400">/ 10</span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Rating"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging) setFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(10, value + 1));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(0, value - 1));
          }
        }}
        className="relative h-6 cursor-pointer touch-none focus-visible:outline-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <div
          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full"
          style={{ width: `${value * 10}%`, backgroundColor: c.hex }}
        />
        <div
          className="absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white dark:border-neutral-900"
          style={{ left: `${value * 10}%`, backgroundColor: c.hex, boxShadow: `0 0 0 6px ${c.hex}33` }}
        />
      </div>

      <div className="mt-2 flex justify-between px-0.5 text-[10px] tabular-nums text-neutral-400">
        {TICKS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
