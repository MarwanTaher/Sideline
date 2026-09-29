import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getTabLocksByAdmin, getPlayerAdminStatuses } from "@/lib/admins";
import type { AdminTabKey } from "@/lib/admin-tabs";
import { listSeasons } from "@/lib/seasons";
import PlayerAdmins from "./player-admins";
import SeasonsAdmin from "./seasons-admin";

export const metadata = {
  title: "Admin control · Sideline",
};

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isAdminView(session.user.role === "super"))) redirect("/leaderboard");

  const [playerAdmins, tabLocks, seasons] = await Promise.all([
    getPlayerAdminStatuses(),
    getTabLocksByAdmin(),
    listSeasons(),
  ]);

  const lockedByAdmin: Record<number, AdminTabKey[]> = {};
  for (const [adminId, keys] of tabLocks) lockedByAdmin[adminId] = keys;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin control</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Promote a player to admin or remove their access, and control which
        sections each admin can use.
      </p>

      <PlayerAdmins players={playerAdmins} lockedByAdmin={lockedByAdmin} />

      <SeasonsAdmin seasons={seasons} />

      <section className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">Diagnostics</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Low-level database and scoring checks. Kept out of the admin menu to
          keep it short.
        </p>
        <Link
          href="/diagnostics"
          className="mt-3 inline-flex rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800"
        >
          Open diagnostics
        </Link>
      </section>
    </main>
  );
}
