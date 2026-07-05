"use client";

import { useState, useTransition } from "react";
import { sendAnnouncementAction } from "@/app/actions/push";

export default function AnnouncementForm({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await sendAnnouncementAction(formData);
      setResult(res);
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium" htmlFor="ann-title">
          Title
        </label>
        <input
          id="ann-title"
          name="title"
          type="text"
          maxLength={80}
          placeholder="Sideline"
          className="mt-1 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="ann-body">
          Message
        </label>
        <textarea
          id="ann-body"
          name="body"
          rows={3}
          maxLength={280}
          required
          placeholder="What's happening?"
          className="mt-1 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? "Sending…" : "Send to everyone"}
        </button>
        {disabled ? (
          <span className="text-sm text-neutral-500">
            Enable push above to send.
          </span>
        ) : null}
        {result ? (
          <span
            className={
              "text-sm " +
              (result.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400")
            }
          >
            {result.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
