"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary. Without this, an unhandled render/runtime error
 * in any page leaves a blank screen. Here we show a recovery UI and log the
 * error (with its digest) so the underlying crash can be diagnosed.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the console (and any attached logging) for triage.
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        The page hit an unexpected error. Try again, or head back to the dashboard.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-neutral-400">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
