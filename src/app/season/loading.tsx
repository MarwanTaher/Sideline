import { SectionRailSkeleton } from "@/components/ui/section-rail";

/** Shown while a tab's data loads, so switching feels immediate. */
export default function SeasonLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 animate-pulse px-4 py-10">
      <SectionRailSkeleton rows={4} />
      <div className="h-8 w-56 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-2 h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-6 space-y-3">
        <div className="h-24 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-32 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      </div>
    </main>
  );
}
