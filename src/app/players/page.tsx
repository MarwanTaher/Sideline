import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import { getPlayersAdminData, getDeletedPlayers } from "@/lib/players-admin";
import PlayersAdmin from "./players-admin";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Players · Sideline",
};

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin =
    (await isAdminView(role === "admin" || role === "super")) &&
    !(await isTabLockedForCurrentUser("players"));
  if (!isAdmin) redirect("/leaderboard");

  const { players, activeCount, inactiveCount, resetRequests } =
    await getPlayersAdminData();
  const deletedPlayers = await getDeletedPlayers();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="players" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Players &amp; Auth</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Manage the roster (name, position, active status) and handle player
        password-reset requests.
      </p>

      <PlayersAdmin
        players={players}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        resetRequests={resetRequests}
        deletedPlayers={deletedPlayers}
      />
    </main>
  );
}
