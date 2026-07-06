"use client";

import { useEffect, useState } from "react";
import { unsubscribePushAction } from "@/app/actions/push";
import {
  pushSupported,
  getExistingSubscription,
  subscribeThisDevice,
} from "@/lib/push-client";

type Status =
  | "loading"
  | "unsupported"
  | "denied"
  | "subscribed"
  | "unsubscribed";

export default function NotificationsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    // Register the SW up front; `serviceWorker.ready` never resolves until a
    // worker exists, so we must not depend on it for the initial state.
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setStatus("unsubscribed"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const result = await subscribeThisDevice();
      if (result === "subscribed") setStatus("subscribed");
      else if (result === "denied") setStatus("denied");
      else if (result === "unsupported") setStatus("unsupported");
      else setStatus("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await getExistingSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-neutral-500">Checking notifications…</p>;
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-neutral-500">
        Push notifications aren&apos;t supported on this browser. On iPhone, add
        Sideline to your Home Screen first, then enable them from there.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-neutral-500">
        Notifications are blocked. Enable them for this site in your browser
        settings, then reload.
      </p>
    );
  }

  const on = status === "subscribed";

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Push notifications</p>
        <p className="text-sm text-neutral-500">
          {on
            ? "You'll be notified about matches and updates on this device."
            : "Get notified when a match goes live and more."}
        </p>
      </div>
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={busy}
        className={
          "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 " +
          (on
            ? "border border-black/10 hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
            : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200")
        }
      >
        {busy ? "…" : on ? "Disable" : "Enable"}
      </button>
    </div>
  );
}
