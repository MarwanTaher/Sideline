"use client";

import { useCallback, useRef } from "react";
import { createTapCounter, playFart, sillySoundsEnabled } from "@/lib/silly-sounds";

type Loaded = { enabled: boolean; audios: HTMLAudioElement[] };

/**
 * T-1: pointer-down handler for the IN/OUT control. The 4th tap within 2 s
 * plays a sound on this phone (custom upload or a synth fart), then cools down.
 */
export function useTapSpam() {
  const counter = useRef<ReturnType<typeof createTapCounter> | null>(null);
  const cfg = useRef<Loaded | null>(null);
  const loading = useRef(false);

  return useCallback(() => {
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
      audio.currentTime = 0;
      void audio.play().catch(() => playFart());
    } else {
      playFart();
    }
    navigator.vibrate?.([40, 30, 80]);
  }, []);
}
