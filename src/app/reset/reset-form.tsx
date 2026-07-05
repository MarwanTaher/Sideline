"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type ResetActionState } from "./actions";

const INITIAL: ResetActionState = { ok: false, message: "" };

const inputCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export default function ResetForm({ token, name }: { token: string; name: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
        <p>{state.message}</p>
        <Link
          href="/login"
          className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-neutral-500">
        Setting a new password for{" "}
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{name}</span>.
      </p>
      <label className="block text-sm">
        <span className="font-medium">New password (min 6 characters)</span>
        <input type="password" name="password" className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Confirm new password</span>
        <input type="password" name="confirm" className={inputCls} />
      </label>
      {state.message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
