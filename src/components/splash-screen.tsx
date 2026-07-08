"use client";

import { useEffect, useState } from "react";
import { AnimatedLogo } from "@/components/animated-logo";

/**
 * Cold-load splash: covers the viewport on a full page load while the app
 * boots. It's server-rendered, so it paints immediately (even before
 * hydration). Once React mounts we let the logo finish drawing, then fade out
 * and unmount — so fast loads aren't held back. Client-side navigations don't
 * remount the root layout, so it only appears on real loads/refreshes.
 */
export function SplashScreen() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Minimum on-screen time lets the draw animation read; the fade follows.
    const fadeTimer = setTimeout(() => setHide(true), 900);
    const goneTimer = setTimeout(() => setGone(true), 1300);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden="true"
      data-hide={hide || undefined}
      className="sideline-splash pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]"
    >
      <AnimatedLogo size={112} />
    </div>
  );
}
