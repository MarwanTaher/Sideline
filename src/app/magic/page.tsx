import Link from "next/link";
import { resolvePlayerFromAccessToken } from "@/lib/access-tokens";
import MagicAutoSubmit from "./magic-auto-submit";

export const metadata = {
  title: "Signing in · Sideline",
};

export const dynamic = "force-dynamic";

export default async function MagicPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const resolved = token ? await resolvePlayerFromAccessToken(token) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 text-center">
      {resolved && token ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            Signing in as {resolved.name}…
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            If you are not redirected automatically, tap Continue.
          </p>
          <div className="mt-6 flex justify-center">
            <MagicAutoSubmit token={token} />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Invalid link</h1>
          <p className="mt-2 text-sm text-neutral-500">
            This magic link is invalid or has been revoked.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Go to sign in
          </Link>
        </>
      )}
    </main>
  );
}
