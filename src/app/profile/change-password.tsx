"use client";

import { useActionState, useRef, useEffect } from "react";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const INITIAL: ChangePasswordState = { ok: false, message: "" };

const inputCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export default function ChangePassword() {
  const [state, action, pending] = useActionState(changePasswordAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <details className="rounded-xl border border-black/10 dark:border-white/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Change password
      </summary>
      <form ref={formRef} action={action} className="space-y-3 border-t border-black/10 px-4 py-4 dark:border-white/10">
        <label className="block text-sm">
          <span className="font-medium">Current password</span>
          <input type="password" name="current" autoComplete="current-password" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">New password (min 8 characters)</span>
          <input type="password" name="password" autoComplete="new-password" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Confirm new password</span>
          <input type="password" name="confirm" autoComplete="new-password" className={inputCls} />
        </label>
        {state.message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              state.ok
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            }`}
          >
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </details>
  );
}
