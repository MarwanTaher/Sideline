import Link from "next/link";
import { auth, signOut } from "@/auth";
import MainNav from "@/components/main-nav";
import BottomNav from "@/components/bottom-nav";
import AccountMenu, { type AccountMenuItem } from "@/components/account-menu";
import { getViewMode } from "@/lib/view-mode";
import { getLockedTabsForPlayer } from "@/lib/admin-access";
import { getNavSignals } from "@/lib/nav-signals";
import { getPlayerContact } from "@/lib/player-profile";
import { ADMIN_MENU_TABS } from "@/lib/admin-tabs";
import { getActiveSubscriptionSeason } from "@/lib/season-subscriptions";
import { LogoMark } from "@/components/logo-mark";
import { setViewModeAction } from "@/app/actions/view-mode";

export default async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  const isAdmin = user?.role === "admin" || user?.role === "super";
  const isSuper = user?.role === "super";
  const canToggle = Boolean(isAdmin && user?.playerId != null);
  const mode = canToggle ? await getViewMode() : "admin";
  const adminView = Boolean(isAdmin && mode === "admin");

  // The header renders on every page, so these must not be sequential — the
  // Neon HTTP driver makes each await a separate round trip.
  const [lockedTabs, navSignals, contact, subscriptionSeason] = await Promise.all([
    adminView && !isSuper && user?.playerId != null
      ? getLockedTabsForPlayer(user.playerId)
      : Promise.resolve([]),
    user ? getNavSignals() : Promise.resolve(null),
    user?.playerId != null ? getPlayerContact(user.playerId) : Promise.resolve(null),
    user ? getActiveSubscriptionSeason() : Promise.resolve(null),
  ]);

  const photoUrl = contact?.photoUrl ?? null;
  // A season still being set up is visible to admins only.
  const showSeason =
    subscriptionSeason != null && (subscriptionSeason.visibleToPlayers || isAdmin);

  const locked = new Set(lockedTabs);
  const adminItems: AccountMenuItem[] = adminView
    ? [
        ...ADMIN_MENU_TABS.filter((t) => !locked.has(t.key)).map((t) => ({
          href: t.href,
          label: t.label,
        })),
        ...(isSuper ? [{ href: "/admin/accounts", label: "Admin control" }] : []),
      ]
    : [];

  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  const account = user ? (
    <AccountMenu
      name={user.name ?? "You"}
      photoUrl={photoUrl}
      roleLabel={user.role && user.role !== "player" ? user.role : "Player"}
      adminView={adminView}
      canToggle={canToggle}
      mode={mode}
      adminItems={adminItems}
      hasSeason={showSeason}
      signOutAction={signOutAction}
    />
  ) : (
    <Link
      href="/login"
      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      Sign in
    </Link>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2">
      <LogoMark className="h-6 w-6 rounded-md md:h-[26px] md:w-[26px]" />
      <span className="font-heading text-sm font-bold uppercase tracking-[0.2em]">Sideline</span>
    </Link>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80">
        <div className="mx-auto w-full max-w-4xl px-4 py-3">
          {/* Mobile: brand left · mode pill + avatar right (nav is the bottom bar) */}
          <div className="flex items-center justify-between gap-2 md:hidden">
            {brand}
            <div className="flex items-center gap-2">
              {canToggle ? <ViewModePill mode={mode} /> : null}
              {account}
            </div>
          </div>

          {/* Desktop: brand left · inline nav + mode pill + avatar right */}
          <div className="hidden items-center justify-between md:flex">
            {brand}
            <div className="flex items-center gap-4">
              {user ? <MainNav signals={navSignals ?? undefined} /> : null}
              {canToggle ? <ViewModePill mode={mode} /> : null}
              {account}
            </div>
          </div>
        </div>
      </header>
      {user ? <BottomNav showSeason={showSeason} /> : null}
    </>
  );
}

/** One-tap switch between admin and player view, colour-matched to the avatar ring. */
function ViewModePill({ mode }: { mode: "player" | "admin" }) {
  const next = mode === "admin" ? "player" : "admin";
  return (
    <form action={setViewModeAction}>
      <input type="hidden" name="mode" value={next} />
      <button
        type="submit"
        title={`Switch to ${next} view`}
        aria-label={`Switch to ${next} view`}
        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 transition ${
          mode === "admin"
            ? "bg-amber-500/15 text-amber-700 ring-amber-500/40 hover:bg-amber-500/25 dark:text-amber-300"
            : "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 hover:bg-emerald-500/25 dark:text-emerald-300"
        }`}
      >
        {mode}
      </button>
    </form>
  );
}
