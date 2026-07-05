import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { CreateMatchForm } from "./create-match-form";

export const metadata = {
  title: "New match · Sideline",
};

export const dynamic = "force-dynamic";

export default async function NewMatchPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  if (!isAdmin) redirect("/matches");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link
        href="/matches"
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← All matches
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create match</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Create the match record, then share the availability link with players. Assign players and
        draft teams from the match page once responses are in.
      </p>

      <CreateMatchForm />
    </main>
  );
}
