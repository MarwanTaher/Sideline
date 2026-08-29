import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getTabLocksByAdmin, getPlayerAdminStatuses } from "@/lib/admins";
import type { AdminTabKey } from "@/lib/admin-tabs";
import PlayerAdmins from "./player-admins";

export const metadata = {
  title: "Admin control · Sideline",
};

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isAdminView(session.user.role === "super"))) redirect("/leaderboard");

  const [playerAdmins, tabLocks] = await Promise.all([
    getPlayerAdminStatuses(),
    getTabLocksByAdmin(),
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
    </main>
  );
}
