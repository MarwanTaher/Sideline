"use client";

import { useEffect, useState } from "react";
import { SectionIcon } from "@/components/section-icon";

const DISMISS_KEY = "sideline_install_prompt_dismissed";

/**
 * `beforeinstallprompt` is a non-standard Chromium event. Type it locally so we
 * can call `prompt()` and read the user's choice without `any`.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Unobtrusive "Install Sideline" affordance for Android/desktop Chromium.
 * It only appears when the browser actually fires `beforeinstallprompt` (i.e.
 * install is genuinely available and the app isn't already installed), so it
 * never nags users who can't install or already did. iOS install guidance is
 * handled separately in the notification prompt.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // ignore storage errors
    }

    // Already running as an installed app — nothing to offer.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    }

    function onInstalled() {
      setHidden(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setHidden(true);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage errors
    }
    setHidden(true);
  }

  if (hidden || !deferred) return null;

  return (
    <div className="mt-6 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <SectionIcon name="matches" className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install Sideline</p>
          <p className="mt-0.5 text-sm text-neutral-500">
            Add it to your home screen for a full-screen, app-like experience.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
