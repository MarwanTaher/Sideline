"use client";

import { useEffect, useState } from "react";
import { SectionIcon } from "@/components/section-icon";
import {
  isIOS,
  isStandalone,
  pushSupported,
  getExistingSubscription,
  subscribeThisDevice,
} from "@/lib/push-client";

const DISMISS_KEY = "sideline_push_prompt_dismissed";

type Mode = "hidden" | "enable" | "ios-install" | "done";

export default function NotificationPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;

      // iOS Safari (not installed) can't do push at all — guide to install.
      if (!pushSupported()) {
        if (isIOS() && !isStandalone()) {
          if (!cancelled) setMode("ios-install");
        }
        return;
      }

      // Don't nag if the user already blocked notifications.
      if (Notification.permission === "denied") return;

      const existing = await getExistingSubscription();
      if (!cancelled && !existing) setMode("enable");
    }

    decide();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setMode("hidden");
  }

  async function enable() {
    setBusy(true);
    try {
      const result = await subscribeThisDevice();
      if (result === "subscribed") {
        setMode("done");
        setTimeout(() => setMode("hidden"), 2500);
      } else if (result === "denied" || result === "unsupported") {
        dismiss();
      }
      // "dismissed"/"error": leave the prompt so they can retry.
    } finally {
      setBusy(false);
    }
  }

  if (mode === "hidden") return null;

  return (
    <div className="mt-6 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <SectionIcon name="diagnostics" className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          {mode === "done" ? (
            <p className="text-sm font-medium">
              Notifications enabled — you&apos;re all set. ⚽
            </p>
          ) : mode === "enable" ? (
            <>
              <p className="text-sm font-medium">Turn on notifications</p>
              <p className="mt-0.5 text-sm text-neutral-500">
                Get alerted when a match goes live, plus reminders and
                announcements.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={enable}
                  disabled={busy}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  {busy ? "Enabling…" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            /* ios-install */
            <>
              <p className="text-sm font-medium">
                Add Sideline to your Home Screen for notifications
              </p>
              <p className="mt-0.5 text-sm text-neutral-500">
                On iPhone, push notifications only work from the installed app.
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
                <li>
                  Tap the <span className="font-medium">Share</span> icon (the
                  square with an up arrow) in Safari.
                </li>
                <li>
                  Scroll down and tap{" "}
                  <span className="font-medium">Add to Home Screen</span>.
                </li>
                <li>
                  Tap <span className="font-medium">Add</span> in the top-right.
                </li>
                <li>Open Sideline from the new Home Screen icon.</li>
                <li>
                  Go to <span className="font-medium">Profile → Notifications</span>{" "}
                  and tap <span className="font-medium">Enable</span>.
                </li>
              </ol>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Got it
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
