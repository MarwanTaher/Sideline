"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { registerAction, type RegisterState } from "./actions";

const INITIAL: RegisterState = { ok: false, message: "" };

const inputCls =
  "mt-1 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15";

export default function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, INITIAL);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center gap-2.5">
        <Image
          src="/logo-mark.svg"
          alt=""
          width={36}
          height={36}
          className="rounded-lg"
        />
        <span className="text-lg font-bold uppercase tracking-[0.2em]">
          Sideline
        </span>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Join Sideline — pick a name and password and you can sign in right away.
      </p>

      {state.ok ? (
        <div className="mt-6">
          <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {state.message}
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <form action={action} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Full name</span>
              <input
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={60}
                autoComplete="name"
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Preferred position</span>
              <select name="position" defaultValue="MID" className={inputCls}>
                <option value="GK">Goalkeeper (GK)</option>
                <option value="DEF">Defender (DEF)</option>
                <option value="MID">Midfielder (MID)</option>
                <option value="FWD">Forward (FWD)</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Confirm password</span>
              <input
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputCls}
              />
            </label>

            {state.message && !state.ok ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {state.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? "Creating…" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-sm text-neutral-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
