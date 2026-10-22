"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  fartAudioState,
  playFart,
  playMomentSoundDetailed,
  sillySoundsEnabled,
  tapSoundPlayer,
  type MomentSoundUrls,
} from "@/lib/silly-sounds";

type Check = { ok: boolean; text: string } | null;

const LOAD_FAILED = "Couldn't load the sound file. Ask an admin to re-upload it in Messages.";
const BLOCKED = "The browser blocked it. Tap the button again.";

function deviceTips(): string {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const tips = [installed ? "Running as the installed app." : "Running in the browser."];
  if (ios) {
    tips.push("iPhone: app sounds follow the silent switch — flip it to ring to hear them.");
    if (installed) tips.push("The installed app keeps its own settings, separate from Safari.");
  } else {
    tips.push("Uses the phone's media volume, not the ringer volume.");
  }
  return tips.join(" ");
}

const noSubscribe = () => () => {};

/**
 * On-device sound check. Each test starts from its own tap, because iOS only
 * allows audio to begin inside a tap, and reports exactly what happened.
 */
export function SoundCheck({ customSounds }: { customSounds: MomentSoundUrls }) {
  const [popup, setPopup] = useState<Check>(null);
  const [tap, setTap] = useState<Check>(null);
  const [tapUrls, setTapUrls] = useState<string[] | null>(null);
  // Device details exist only in the browser; render nothing on the server.
  const tips = useSyncExternalStore(noSubscribe, deviceTips, () => "");

  useEffect(() => {
    let alive = true;
    // Load before the tap so the test can start playback synchronously in it.
    fetch("/api/tap-spam", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { urls: [] }))
      .then((c: { urls?: string[] }) => alive && setTapUrls(c.urls ?? []))
      .catch(() => alive && setTapUrls([]));
    return () => {
      alive = false;
    };
  }, []);

  const off = { ok: false, text: "Silly sounds are switched off on this phone." };

  const testPopup = () => {
    if (!sillySoundsEnabled()) return setPopup(off);
    setPopup({ ok: true, text: "Playing…" });
    void playMomentSoundDetailed("good", undefined, customSounds).then((result) =>
      setPopup(
        result === "played"
          ? { ok: true, text: "Played. Nothing heard? Check the volume." }
          : result === "blocked"
            ? { ok: false, text: BLOCKED }
            : { ok: false, text: LOAD_FAILED },
      ),
    );
  };

  const testTap = () => {
    if (!sillySoundsEnabled()) return setTap(off);
    if (tapUrls?.length) {
      setTap({ ok: true, text: "Playing…" });
      void tapSoundPlayer()
        .play(tapUrls)
        .then((result) =>
          setTap(result === "played" ? { ok: true, text: "Played your uploaded tap sound." } : { ok: false, text: LOAD_FAILED }),
        );
      return;
    }
    playFart();
    setTimeout(() => {
      const state = fartAudioState();
      setTap(
        state === "running"
          ? { ok: true, text: "Played the default sound." }
          : { ok: false, text: `Audio is ${state} on this phone. Tap the button again.` },
      );
    }, 400);
  };

  return (
    <div className="mt-1 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900/60">
      <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Sound check</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={testPopup}
          className="min-h-9 rounded-lg border border-black/10 px-3 text-xs font-semibold transition active:scale-95 dark:border-white/15"
        >
          ▶ Pop-up sound
        </button>
        <button
          type="button"
          onClick={testTap}
          disabled={tapUrls === null}
          className="min-h-9 rounded-lg border border-black/10 px-3 text-xs font-semibold transition active:scale-95 disabled:opacity-50 dark:border-white/15"
        >
          ▶ IN / OUT sound
        </button>
      </div>
      <div aria-live="polite" className="mt-2 space-y-1 text-xs">
        {popup ? <p className={popup.ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>Pop-up: {popup.text}</p> : null}
        {tap ? <p className={tap.ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>IN / OUT: {tap.text}</p> : null}
      </div>
      {tips ? <p className="mt-2 text-[11px] text-neutral-500">{tips}</p> : null}
    </div>
  );
}
