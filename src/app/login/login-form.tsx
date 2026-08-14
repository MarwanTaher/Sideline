"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { requestResetAction } from "./actions";

type PlayerOption = { id: number; name: string };

/**
 * Resolve a safe post-login destination. Falls back to the dashboard ("/")
 * when the callbackUrl is empty or not a same-site relative path — an empty
 * string would otherwise make `router.push("")` reload the login page and
 * appear stuck.
 */
function resolveTarget(callbackUrl: string | undefined): string {
  if (!callbackUrl) return "/";
  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//") || callbackUrl.startsWith("/\\")) {
    return "/";
  }
  return callbackUrl;
}

export default function LoginForm({
  players,
  callbackUrl = "/",
}: {
  players: PlayerOption[];
  callbackUrl?: string;
}) {
  const target = resolveTarget(callbackUrl);
  const [playerId, setPlayerId] = useState<string>(
    players[0]?.id.toString() ?? "",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      role: "player",
      identifier: playerId,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!res || res.error) {
      setError("Invalid player or password.");
      return;
    }

    // Full-page navigation so the freshly set session cookie is sent with the
    // next request; a client-side router.push can race the cookie and bounce
    // back to /login?callbackUrl=...
    window.location.assign(target);
  }

  const canSubmit = password.length > 0 && playerId.length > 0;

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
        <span className="font-heading text-lg font-bold uppercase tracking-[0.2em]">
          Sideline
        </span>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Welcome back to Sideline.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Player</span>
          {players.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-500">
              No player accounts yet.
            </p>
          ) : (
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-white/15"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-white/15"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-500">
        New player?{" "}
        <Link href="/register" className="font-medium underline">
          Create an account
        </Link>
      </p>

      {players.length > 0 && <ForgotPassword playerId={playerId} />}
    </div>
  );
}

function ForgotPassword({ playerId }: { playerId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function requestReset() {
    setSending(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("playerId", playerId);
    const res = await requestResetAction({ ok: false, message: "" }, fd);
    setSending(false);
    setMsg({ ok: res.ok, text: res.message });
  }

  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        Forgot your password?
      </summary>
      <p className="mt-2 text-neutral-500">
        Submit a reset request and the admin will generate a reset link for you.
      </p>
      <button
        type="button"
        onClick={requestReset}
        disabled={sending || !playerId}
        className="mt-2 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
      >
        {sending ? "Sending…" : "Request password reset"}
      </button>
      {msg && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            msg.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}
    </details>
  );
}
