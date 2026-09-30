/** Shown while a tab's data loads, so switching feels immediate. */
export default function AdminLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 animate-pulse px-4 py-10">
      <div className="h-8 w-48 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-4 h-9 w-full max-w-sm rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-6 space-y-3">
        <div className="h-28 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-40 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      </div>
    </main>
  );
}
