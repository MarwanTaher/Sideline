"use client";

import { useEffect, useState } from "react";
import { SectionIcon } from "@/components/section-icon";
import { subscribeThisDevice, pushSupported } from "@/lib/push-client";

const DONE_KEY = "sideline_onboarded_v1";

interface Card {
  icon: "matches" | "leaderboard" | "diagnostics";
  title: string;
  body: string;
}

const CARDS: Card[] = [
  {
    icon: "matches",
    title: "Welcome to Sideline",
    body: "Set yourself available for upcoming matches, get balanced into teams, and track how the season plays out — all in one place.",
  },
  {
    icon: "leaderboard",
    title: "How your rating works",
    body: "Your rating blends teammate peer votes with match stats. Play, score, and vote for others — it settles over a few matches, so don't sweat one result.",
  },
];

export default function OnboardingFlow({ show }: { show: boolean }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notifState, setNotifState] = useState<"idle" | "done" | "skipped">("idle");

  useEffect(() => {
    if (!show) return;
    try {
      if (localStorage.getItem(DONE_KEY) === "1") return;
    } catch {
      return;
    }
    setVisible(true);
  }, [show]);

  function finish() {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  }

  async function enableNotifications() {
    setBusy(true);
    try {
      const result = await subscribeThisDevice();
      if (result === "subscribed") setNotifState("done");
      else setNotifState("skipped");
    } catch {
      setNotifState("skipped");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  // The notifications ask is the final, highest-intent card.
  const totalSteps = CARDS.length + 1;
  const onNotifStep = step === CARDS.length;
  const card = onNotifStep ? null : CARDS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-950">
        {/* Progress dots */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-neutral-900 dark:bg-white" : "w-1.5 bg-neutral-300 dark:bg-neutral-700"
              }`}
            />
          ))}
        </div>

        {card ? (
          <div className="text-center">
            <SectionIcon name={card.icon} className="mx-auto h-12 w-12" />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">{card.title}</h2>
            <p className="mt-2 text-sm text-neutral-500">{card.body}</p>
          </div>
        ) : (
          <div className="text-center">
            <SectionIcon name="diagnostics" className="mx-auto h-12 w-12" />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Stay in the loop</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {notifState === "done"
                ? "You're all set — we'll ping you when matches go live."
                : "Turn on notifications to know the moment a match opens, plus reminders and results. This is the one thing worth enabling."}
            </p>
            {notifState === "idle" && pushSupported() ? (
              <button
                type="button"
                onClick={enableNotifications}
                disabled={busy}
                className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Enabling…" : "Enable notifications"}
              </button>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-medium text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            {onNotifStep ? "Done" : "Skip"}
          </button>
          {onNotifStep ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {notifState === "done" ? "Finish" : "Maybe later"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
