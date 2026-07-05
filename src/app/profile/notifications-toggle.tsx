"use client";

import { useEffect, useState } from "react";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/actions/push";

type Status =
  | "loading"
  | "unsupported"
  | "denied"
  | "subscribed"
  | "unsubscribed";

/** Convert a base64url VAPID key to the Uint8Array the PushManager expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function toSaved(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

export default function NotificationsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setStatus("unsubscribed"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setStatus("unsupported");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });

      const res = await subscribePushAction(toSaved(sub));
      setStatus(res.ok ? "subscribed" : "unsubscribed");
    } catch {
      setStatus("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
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
