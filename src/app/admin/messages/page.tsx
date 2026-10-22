import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMomentCopy } from "@/lib/moment-copy-settings";
import { getTapSpamConfig } from "@/lib/tap-spam-settings";
import MessagesAdmin from "../accounts/messages-admin";

export const metadata = {
  title: "Messages · Sideline",
};

export const dynamic = "force-dynamic";

export default async function MessagesAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  const adminView =
    (role === "admin" || role === "super") &&
    (await isAdminView(role === "admin" || role === "super"));
  if (!adminView) redirect("/leaderboard");

  const [overrides, tapSpam] = await Promise.all([
    getMomentCopy(),
    getTapSpamConfig(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Customize matchday moments and sounds for the group.
        </p>
      </header>
      <MessagesAdmin
        overrides={overrides}
        name={session.user.name ?? "Admin"}
        tapSpam={tapSpam}
      />
    </main>
  );
}
