import { AnimatedLogo } from "@/components/animated-logo";

/**
 * Shown automatically (via Suspense) whenever a route navigation is waiting on
 * server data. Gives every "the page is loading" moment clear feedback.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24">
      <AnimatedLogo size={72} loop />
      <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-400">
        Loading…
      </p>
    </main>
  );
}
