"use client";

import { useSyncExternalStore } from "react";
import { SILLY_SOUNDS_KEY, playMomentSound, sillySoundsEnabled, stopMomentSound } from "@/lib/silly-sounds";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

/** Per-device mute for moment recordings and the tap-spam egg. */
export function SillySoundsToggle() {
  const on = useSyncExternalStore(subscribe, sillySoundsEnabled, () => true);

  const toggle = () => {
    try {
      localStorage.setItem(SILLY_SOUNDS_KEY, on ? "off" : "on");
    } catch {
      return;
    }
    listeners.forEach((l) => l());
    if (!on) void playMomentSound("good", "applause");
    else stopMomentSound();
  };

  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">Silly sounds</span>
        <span className="block text-xs text-neutral-500">
          Recorded applause, cheers and laughter, plus the IN / OUT surprise. This phone only.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-label="Silly sounds"
        aria-checked={on}
        onClick={toggle}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
