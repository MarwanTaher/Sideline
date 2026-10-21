"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";
import { createTapCounter, playFart, sillySoundsEnabled, TAP_SPAM } from "@/lib/silly-sounds";

type Loaded = { enabled: boolean; audios: HTMLAudioElement[] };
export type Puff = { id: number; x: number; y: number; size: number; drift: number };

const MAX_PUFFS = 14;

/**
 * T-1: pointer-down handler for the IN/OUT control. Once the player is
 * spamming (3 taps in 1.5 s), every tap plays a sound and vibrates at once,
 * and the control smokes until 1 s passes without a tap.
 */
export function useTapSpam() {
  const counter = useRef<ReturnType<typeof createTapCounter> | null>(null);
  const cfg = useRef<Loaded | null>(null);
  const loading = useRef(false);
  const calm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const [smoking, setSmoking] = useState(false);

  const onTap = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!sillySoundsEnabled()) return;
    if (!cfg.current && !loading.current) {
      loading.current = true;
      fetch("/api/tap-spam")
        .then((r) => (r.ok ? r.json() : { enabled: true, urls: [] }))
        .then((c: { enabled: boolean; urls: string[] }) => {
          cfg.current = {
            enabled: c.enabled,
            audios: c.urls.map((u) => {
              const a = new Audio(u);
              a.preload = "auto";
              return a;
            }),
          };
        })
        .catch(() => {
          loading.current = false;
        });
    }
    counter.current ??= createTapCounter();
    if (!counter.current(Date.now())) return;
    const c = cfg.current;
    if (c && !c.enabled) return;

    const audio = c?.audios.length ? c.audios[Math.floor(Math.random() * c.audios.length)] : null;
    if (audio) {
      // A clone lets rapid taps overlap instead of restarting one sound.
      const a = audio.cloneNode(true) as HTMLAudioElement;
      void a.play().catch(() => playFart());
    } else {
      playFart();
    }
    navigator.vibrate?.(60);

    const box = e.currentTarget.getBoundingClientRect();
    const id = nextId.current++;
    setPuffs((p) => [
      ...p.slice(-(MAX_PUFFS - 1)),
      {
        id,
        x: Math.min(Math.max(e.clientX - box.left, 16), box.width - 16),
        y: Math.min(Math.max(e.clientY - box.top, 8), box.height - 8),
        size: 28 + Math.random() * 26,
        drift: Math.random() * 60 - 30,
      },
    ]);
    setSmoking(true);
    if (calm.current) clearTimeout(calm.current);
    calm.current = setTimeout(() => {
      setSmoking(false);
      // Let the last puffs finish rising before clearing them.
      calm.current = setTimeout(() => setPuffs([]), 1400);
    }, TAP_SPAM.calmMs);
  }, []);

  return { onTap, puffs, smoking };
}
