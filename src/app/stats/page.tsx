import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import {
  getAllPendingSubmissions,
  getStatsReviewCounts,
  getStatsSubmissionStatus,
  listMatchesForStats,
  type StatSubmissionState,
} from "@/lib/stats";
import { ReviewRow, BackfillPanel, StatsMatchPicker } from "./review-controls";
import { Badge } from "@/components/ui/badge";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Stats review · Sideline",
};

export const dynamic = "force-dynamic";

const STATE_TONE: Record<StatSubmissionState, "success" | "warning" | "info" | "neutral"> = {
  approved: "success",
  pending: "info",
  rejected: "warning",
  missing: "neutral",
};

const STATE_LABEL: Record<StatSubmissionState, string> = {
  approved: "approved",
  pending: "pending",
  rejected: "rejected",
  missing: "not submitted",
};

export default async function StatsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin =
    (await isAdminView(role === "admin" || role === "super")) &&
    !(await isTabLockedForCurrentUser("stats"));
  if (!isAdmin) redirect("/matches");

  const { match } = await searchParams;
  const parsed = Number(match);
  const selectedMatchId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;

  const [pending, counts, matches] = await Promise.all([
    getAllPendingSubmissions(),
    getStatsReviewCounts(),
    listMatchesForStats(),
  ]);

  const submissions =
    selectedMatchId > 0 ? await getStatsSubmissionStatus(selectedMatchId) : [];
  const submittedCount = submissions.filter((s) => s.state !== "missing").length;
  const missingCount = submissions.length - submittedCount;

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
        <h2 className="text-lg font-semibold tracking-tight">Submission status by match</h2>
        <p className="mt-1 text-sm text-neutral-500">
          See who has added their stats for a match and who hasn&apos;t.
        </p>
        <div className="mt-3 max-w-sm">
          <StatsMatchPicker matches={matches} selectedMatchId={selectedMatchId} />
        </div>

        {selectedMatchId === 0 ? null : submissions.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No players on the roster for this match.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex gap-6 text-sm">
              <div>
                <div className="text-xs text-neutral-500">Roster</div>
                <div className="text-lg font-semibold">{submissions.length}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">Submitted</div>
                <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {submittedCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">Not yet</div>
                <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                  {missingCount}
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {submissions.map((s) => (
                <li
                  key={s.playerId}
                  className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="flex items-center gap-3">
                    {s.state !== "missing" ? (
                      <span className="text-xs text-neutral-500">
                        {s.goals ?? 0}G · {s.assists ?? 0}A
                      </span>
                    ) : null}
                    <Badge tone={STATE_TONE[s.state]} dot>
                      {STATE_LABEL[s.state]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
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
