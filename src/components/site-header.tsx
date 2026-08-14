import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";
import MainNav from "@/components/main-nav";
import BottomNav from "@/components/bottom-nav";
import { getViewMode } from "@/lib/view-mode";
import { getLockedTabsForPlayer } from "@/lib/admin-access";
import { getNavSignals } from "@/lib/nav-signals";
import { getPlayerContact } from "@/lib/player-profile";
import { setViewModeAction } from "@/app/actions/view-mode";

export default async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  const isAdmin = user?.role === "admin" || user?.role === "super";
  const isSuper = user?.role === "super";
  const canToggle = Boolean(isAdmin && user?.playerId != null);
  const mode = canToggle ? await getViewMode() : "admin";
  const adminView = Boolean(isAdmin && mode === "admin");
  const lockedTabs =
    adminView && !isSuper && user?.playerId != null
      ? await getLockedTabsForPlayer(user.playerId)
      : [];

  const navSignals = user ? await getNavSignals() : null;

  const contact = user?.playerId != null ? await getPlayerContact(user.playerId) : null;
  const photoUrl = contact?.photoUrl ?? null;
  const initial = (user?.name?.trim()?.charAt(0) ?? "?").toUpperCase();

  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/80 backdrop-blur relative dark:border-white/10 dark:bg-neutral-950/80">
      <div className="mx-auto w-full max-w-4xl px-4 py-3">
        {/* Mobile top bar: brand left · profile right (nav is the bottom bar) */}
        <div className="flex items-center justify-between md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-mark.svg" alt="" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-bold uppercase tracking-[0.2em]">Sideline</span>
          </Link>

          {user ? (
            user.playerId != null ? (
              <Link
                href="/profile"
                aria-label={`View your profile, ${user.name}`}
                title="Your profile"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-sm font-semibold text-white shadow-sm ring-2 ring-emerald-600/20 transition hover:bg-emerald-700"
              >
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initial
                )}
              </Link>
            ) : (
              <span className="text-xs text-neutral-500">{user.name}</span>
            )
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* Desktop bar: brand left · inline nav right */}
        <div className="hidden items-center justify-between md:flex">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-mark.svg" alt="" width={26} height={26} className="rounded-md" />
            <span className="text-sm font-bold uppercase tracking-[0.2em]">Sideline</span>
          </Link>

          <div className="flex items-center gap-4">
            {user ? (
              <MainNav adminView={adminView} isSuper={isSuper} lockedTabs={lockedTabs} signals={navSignals ?? undefined} />
            ) : null}
            {canToggle ? <ViewToggle mode={mode} /> : null}
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
                    aria-label={`View your profile, ${user.name}`}
                    title="Your profile"
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-xs font-semibold text-white shadow-sm ring-2 ring-emerald-600/20 transition hover:bg-emerald-700"
                  >
                    {photoUrl ? (
                      <Image
                        src={photoUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initial
                    )}
                  </Link>
                ) : null}
                {user.playerId == null ? (
                  <span className="text-neutral-500">{user.name}</span>
                ) : null}
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
          </div>
        </div>
      </div>
    </header>
      {user ? (
        <BottomNav
          adminView={adminView}
          isSuper={isSuper}
          lockedTabs={lockedTabs}
          canToggle={canToggle}
          mode={mode}
          signOutAction={signOutAction}
        />
      ) : null}
    </>
  );
}

function ViewToggle({ mode }: { mode: string }) {
  return (
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
  );
}
