import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import { getAllPendingSubmissions, getStatsReviewCounts } from "@/lib/stats";
import { ReviewRow, BackfillPanel } from "./review-controls";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Stats review · Sideline",
};

export const dynamic = "force-dynamic";

export default async function StatsReviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin =
    (await isAdminView(role === "admin" || role === "super")) &&
    !(await isTabLockedForCurrentUser("stats"));
  if (!isAdmin) redirect("/matches");

  const [pending, counts] = await Promise.all([
    getAllPendingSubmissions(),
    getStatsReviewCounts(),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="stats" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Stats review</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">Pending submissions</h2>
        {pending.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-lg bg-neutral-50 px-4 py-10 text-center dark:bg-neutral-900">
            <SectionIcon name="stats" className="h-12 w-12 opacity-80" />
            <p className="text-sm text-neutral-500">
              No pending submissions.{" "}
              <Link href="/matches" className="underline">
                View matches
              </Link>
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((sub) => (
              <ReviewRow key={sub.id} sub={sub} />
            ))}
          </ul>
        )}
      </section>

      <BackfillPanel />
    </main>
  );
}
