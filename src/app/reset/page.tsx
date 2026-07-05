import Link from "next/link";
import { getResetTokenInfo } from "@/lib/password-reset";
import ResetForm from "./reset-form";

export const metadata = {
  title: "Reset password · Sideline",
};

export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const info = token ? await getResetTokenInfo(token) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set new password</h1>

      <div className="mt-6">
        {info && info.valid && token ? (
          <ResetForm token={token} name={info.name ?? "your account"} />
        ) : (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p>
              {info?.reason === "used"
                ? "This reset link has already been used."
                : info?.reason === "expired"
                  ? "This reset link has expired. Please request a new one."
                  : "This reset link is invalid."}
            </p>
            <Link
              href="/login"
              className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
