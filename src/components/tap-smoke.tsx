"use client";

import type { Puff } from "@/components/use-tap-spam";

/** Smoke puffs rising from where the player tapped. Purely decorative. */
export function TapSmoke({ puffs, smoking }: { puffs: Puff[]; smoking: boolean }) {
  if (puffs.length === 0 && !smoking) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-visible">
      {puffs.map((p) => (
        <span
          key={p.id}
          className="tap-smoke absolute rounded-full"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            ["--drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
      {smoking
        ? [0, 1, 2].map((i) => (
            <span
              key={`loop-${i}`}
              className="tap-smoke tap-smoke--loop absolute rounded-full"
              style={{
                left: `${25 + i * 25}%`,
                top: "20%",
                width: 30,
                height: 30,
                animationDelay: `${i * 0.35}s`,
                ["--drift" as string]: `${(i - 1) * 18}px`,
              }}
            />
          ))
        : null}
    </span>
  );
}
