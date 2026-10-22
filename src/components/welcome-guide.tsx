"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const DISMISS_KEY = "sideline_welcome_guide_dismissed";
const CHANGE_EVENT = "sideline-welcome-guide-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) !== "1";
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function WelcomeGuide() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Still dismiss for other mounted instances if storage is unavailable.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  if (!visible) return null;

  return (
    <section
      aria-labelledby="welcome-title"
      className="mt-4 rounded-2xl border border-emerald-700/20 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-950/20"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="welcome-title" className="text-sm font-semibold">
            Welcome to Sideline
          </h2>
          <ol className="mt-2 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
            <li>
              <span className="font-semibold">1.</span> Install Sideline from your
              browser menu for quick access.
            </li>
            <li>
              <span className="font-semibold">2.</span>{" "}
              <Link href="/profile" className="font-medium underline underline-offset-2">
                Enable notifications
              </Link>{" "}
              to hear when the team needs you.
            </li>
            <li>
              <span className="font-semibold">3.</span>{" "}
              <Link href="/profile" className="font-medium underline underline-offset-2">
                Set your preferred position
              </Link>{" "}
              so team drafts have the right details.
            </li>
          </ol>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome guide"
          className="min-h-11 min-w-11 shrink-0 rounded-lg text-neutral-600 hover:bg-emerald-900/10 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </section>
  );
}
