import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getAdminAccounts, getLinkablePlayers } from "@/lib/admins";
import AccountsAdmin from "./accounts-admin";

export const metadata = {
  title: "Accounts · Sideline",
};

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isAdminView(session.user.role === "super"))) redirect("/leaderboard");

  const [accounts, players] = await Promise.all([
    getAdminAccounts(),
    getLinkablePlayers(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin accounts</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Link an admin account to a player so the same person can administer and
        also vote, set availability, and appear on the leaderboard — all with one
        login. Leave unlinked for admins who never play.
      </p>

      <AccountsAdmin accounts={accounts} players={players} />
    </main>
  );
}
