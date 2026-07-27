import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import {
  getMatchParticipants,
  getVoteAuditRows,
  getVoteSubmissionStatus,
  getVotesForReview,
  listMatchesForReview,
  reviewCounts,
} from "@/lib/vote-admin";
import { getMotmTally, getMotmVoteDetails } from "@/lib/motm";
import { VotesAdmin } from "./votes-admin";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Vote management · Sideline",
};

export const dynamic = "force-dynamic";

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin =
    (await isAdminView(role === "admin" || role === "super")) &&
    !(await isTabLockedForCurrentUser("votes"));
  if (!isAdmin) redirect("/leaderboard");

  const { match } = await searchParams;
  const parsed = Number(match);
  const selectedMatchId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;

  const [matches, votes, audit, participants] = await Promise.all([
    listMatchesForReview(),
    getVotesForReview(selectedMatchId),
    getVoteAuditRows(selectedMatchId),
    selectedMatchId > 0 ? getMatchParticipants(selectedMatchId) : Promise.resolve([]),
  ]);

  const submissions =
    selectedMatchId > 0 ? await getVoteSubmissionStatus(selectedMatchId) : [];

  const [motmTally, motmVotes] =
    selectedMatchId > 0
      ? await Promise.all([
          getMotmTally(selectedMatchId),
          getMotmVoteDetails(selectedMatchId),
        ])
      : [[], []];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="votes" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Vote management</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Review, edit, add, exclude and auto-flag peer votes. Every change is recorded in the audit log.
      </p>

      <VotesAdmin
        matches={matches}
        selectedMatchId={selectedMatchId}
        votes={votes}
        counts={reviewCounts(votes)}
        audit={audit}
        participants={participants}
        submissions={submissions}
        motmTally={motmTally}
        motmVotes={motmVotes}
      />
    </main>
  );
}
