import { AnimatedLogo } from "@/components/animated-logo";

/**
 * Cold-load splash: covers the viewport on a full page load while the app
 * boots, plays the logo "draw" animation, then fades itself out via CSS
 * (no client JS, so it works even before hydration). Client-side navigations
 * don't remount the root layout, so it only appears on real loads/refreshes.
 */
export function SplashScreen() {
  return (
    <div
      aria-hidden="true"
      className="sideline-splash pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]"
    >
      <AnimatedLogo size={112} />
    </div>
  );
}
