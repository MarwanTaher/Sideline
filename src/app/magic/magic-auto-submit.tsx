"use client";

import { useEffect, useRef } from "react";
import { magicLoginAction } from "./actions";

/** Auto-submits the magic-link sign-in form on mount. */
export default function MagicAutoSubmit({ token }: { token: string }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.requestSubmit();
  }, []);
  return (
    <form ref={ref} action={magicLoginAction}>
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Continue
      </button>
    </form>
  );
}
