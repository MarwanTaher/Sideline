import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getVotingState, votingOpen, type MatchdayStatus } from "@/lib/voting";
import { getMotmTally, getMotmVote, getMotmVoteCount } from "@/lib/motm";
import { VoteForm } from "./vote-form";
import { MotmVote } from "./motm-vote";
import { MatchNav } from "../match-nav";
import { getAvailabilityMatch } from "@/lib/availability";
import { getMatchDetail } from "@/lib/matches";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { getMatchPhase } from "@/lib/match-phase";
import { matchLabelWithTime } from "@/lib/format";
import { MatchPageHeader } from "../match-page-header";
import { MessageAdminLink } from "@/components/message-admin-link";

export const metadata = {
  title: "Vote · Sideline",
};

// Ballot is read live on every request.
export const dynamic = "force-dynamic";

const MATCHDAY_BADGE: Record<MatchdayStatus, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  closed: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

export default async function VotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  const playerId = session.user.playerId;
  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const [availability, detail, lockEnabled] = await Promise.all([
    getAvailabilityMatch(matchId),
    getMatchDetail(matchId),
    isAvailabilityLockEnabled(),
  ]);
  if (!availability || !detail) notFound();
  const phase = getMatchPhase({
    matchdayStatus: availability.matchdayStatus,
    availabilityOpen: availability.availabilityOpen,
    kickoffAt: availability.kickoffAt,
    lockEnabled,
    hasRoster: detail.teams.some((team) => team.players.length > 0),
  });

  if (playerId == null) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <MatchPageHeader
          matchId={matchId}
          dateLabel={matchLabelWithTime(availability.playedOn, availability.matchTime)}
          title="Rate players"
          phase={phase}
        />
        <MatchNav matchId={matchId} isAdmin={isAdmin} />
        <p className="mt-2 text-sm text-neutral-500">
          Only player accounts can vote. Admins can review votes from the admin tools.
        </p>
      </main>
    );
  }

  const state = await getVotingState(matchId, playerId);
  if (!state) notFound();
  const statePhase = getMatchPhase({
    matchdayStatus: state.matchdayStatus,
    availabilityOpen: availability.availabilityOpen,
    kickoffAt: availability.kickoffAt,
    lockEnabled,
    hasRoster: detail.teams.some((team) => team.players.length > 0),
  });

  const openForAccess =
    state.matchdayStatus === "draft" || state.matchdayStatus === "active";
  if (!isAdmin && !state.voterInRoster && !openForAccess) {
    redirect("/matches");
  }

  const open = votingOpen(state.matchdayStatus);

  const [motmTally, myMotmVote, motmVoteCount] = await Promise.all([
    getMotmTally(matchId),
    getMotmVote(matchId, playerId),
    getMotmVoteCount(matchId),
  ]);
  const motmCandidates = state.ballot.map((b) => ({ playerId: b.playerId, name: b.name }));

  let notice: string | null = null;
  if (state.matchdayStatus === "draft") {
    notice = "The matchday hasn't started yet. Voting opens once the admin activates it.";
  } else if (state.matchdayStatus === "closed") {
    notice = "This matchday has ended. Voting is now locked.";
  } else if (!state.voterInRoster) {
    notice = "You are not on the roster for this match, so you can't vote.";
  } else if (state.ballot.length === 0) {
    notice = "There is no one else on the roster to rate yet.";
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <MatchPageHeader
        matchId={matchId}
        dateLabel={matchLabelWithTime(availability.playedOn, availability.matchTime)}
        title="Rate players"
        phase={statePhase}
      />
      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${MATCHDAY_BADGE[state.matchdayStatus]}`}
        >
          {state.matchdayStatus}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Rate every teammate and opponent from 0 to 10, or skip anyone you&apos;d rather not rate.
      </p>

      {notice ? (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-600 dark:border-white/10 dark:text-neutral-300">
          {notice}
          {state.matchdayStatus === "closed" ? (
            <>
              {" "}
              <Link className="font-semibold underline underline-offset-2" href={`/matches/${matchId}`}>
                See match overview
              </Link>
              .
            </>
          ) : state.matchdayStatus === "draft" || !state.voterInRoster ? (
            <>
              {" "}
              <MessageAdminLink
                matchId={matchId}
                reason="I need help with voting access for this match."
              />
            </>
          ) : null}
        </p>
      ) : open && state.voterInRoster ? (
        <VoteForm
          matchId={matchId}
          ballot={state.ballot}
          hasVotedBefore={state.hasVotedBefore}
        />
      ) : null}

      {state.voterInRoster || isAdmin ? (
        <MotmVote
          matchId={matchId}
          candidates={motmCandidates}
          myVote={myMotmVote}
          tally={motmTally}
          voteCount={motmVoteCount}
          canVote={open && state.voterInRoster}
          showResults={isAdmin}
        />
      ) : null}
    </main>
  );
}
