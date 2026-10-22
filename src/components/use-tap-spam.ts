"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createTapCounter, createTapSoundPlayer, playFart, sillySoundsEnabled, TAP_SPAM } from "@/lib/silly-sounds";

type Loaded = { enabled: boolean; urls: string[] };
export type Puff = { id: number; x: number; y: number; size: number; drift: number };

const MAX_PUFFS = 14;

/**
 * T-1: pointer-down handler for the IN/OUT control. Once the player is
 * spamming (3 taps in 1.5 s), every tap plays a sound and vibrates at once,
 * and the control smokes until 1 s passes without a tap. The config is loaded
 * on mount so the first spam tap already uses the admin's custom sound.
 */
export function useTapSpam() {
  const counter = useRef<ReturnType<typeof createTapCounter> | null>(null);
  const player = useRef<ReturnType<typeof createTapSoundPlayer> | null>(null);
  const cfg = useRef<Loaded | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const calm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const [smoking, setSmoking] = useState(false);

  const load = useCallback(() => {
    loading.current ??= fetch("/api/tap-spam")
      .then((r) => (r.ok ? r.json() : { enabled: true, urls: [] }))
      .then((c: Loaded) => {
        cfg.current = { enabled: c.enabled, urls: c.urls };
        player.current ??= createTapSoundPlayer();
        player.current.preload(c.urls);
      })
      .catch((error: unknown) => {
        console.error("Could not load tap sounds.", error);
        loading.current = null;
      });
    return loading.current;
  }, []);

  useEffect(() => {
    if (sillySoundsEnabled()) void load();
    return () => {
      player.current?.stop();
      if (calm.current) clearTimeout(calm.current);
    };
  }, [load]);

  const onTap = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!sillySoundsEnabled()) return;
    if (!cfg.current) void load();
    counter.current ??= createTapCounter();
    if (!counter.current(Date.now())) return;
    const c = cfg.current;
    if (c && !c.enabled) return;

    // Until the config arrives, stay quiet rather than guess the default fart.
    if (c?.urls.length) {
      player.current ??= createTapSoundPlayer();
      player.current.play(c.urls);
    } else if (c) {
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
  }, [load]);

  return { onTap, puffs, smoking };
}
