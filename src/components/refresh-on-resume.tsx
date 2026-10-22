"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Long enough to skip quick app switches, short enough to feel fresh. */
const STALE_AFTER_MS = 60_000;

/**
 * An installed app is resumed from memory rather than reloaded, so server data
 * (new celebration pop-ups, admin sound changes, availability) would stay as it
 * was when the app was last opened. Refresh the current route on return after
 * a real absence; client state such as form input is kept by router.refresh().
 */
export default function RefreshOnResume() {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt != null && Date.now() - hiddenAt >= STALE_AFTER_MS) router.refresh();
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);

  return null;
}
