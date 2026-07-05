import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";
import MainNav from "@/components/main-nav";
import { getViewMode } from "@/lib/view-mode";
import { setViewModeAction } from "@/app/actions/view-mode";

export default async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  const isAdmin = user?.role === "admin" || user?.role === "super";
  const isSuper = user?.role === "super";
  const canToggle = Boolean(isAdmin && user?.playerId != null);
  const mode = canToggle ? await getViewMode() : "admin";
  const adminView = Boolean(isAdmin && mode === "admin");

  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2"
        >
          <Image
            src="/logo-mark.svg"
            alt=""
            width={26}
            height={26}
            className="rounded-md"
          />
          <span className="text-sm font-bold uppercase tracking-[0.2em]">
            Sideline
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {user ? <MainNav adminView={adminView} isSuper={isSuper} /> : null}

          {canToggle ? (
            <div
              role="group"
              aria-label="View as"
              className="flex items-center gap-0.5 rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/15"
            >
              {(["player", "admin"] as const).map((m) => (
                <form key={m} action={setViewModeAction}>
                  <input type="hidden" name="mode" value={m} />
                  <button
                    type="submit"
                    aria-pressed={mode === m}
                    className={`rounded-md px-2 py-0.5 font-medium capitalize transition ${
                      mode === m
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                    }`}
                  >
                    {m}
                  </button>
                </form>
              ))}
            </div>
          ) : null}

          {user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="flex items-center gap-3"
            >
              {user.playerId != null ? (
                <Link
                  href="/profile"
                  className="font-medium text-neutral-700 transition hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
                >
                  {user.name}
                </Link>
              ) : (
                <span className="text-neutral-500">{user.name}</span>
              )}
              {user.role && user.role !== "player" && adminView ? (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {user.role}
                </span>
              ) : null}
              <button
                type="submit"
                className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium transition hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
