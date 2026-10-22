import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getDraftState } from "@/lib/draft";
import { PitchBoard } from "./pitch-board";
import { MatchNav } from "../match-nav";
import { PublishTeams } from "./publish-teams";
import { getTeamsPublishedAt } from "@/lib/moments";
import { getFieldFeatures } from "@/lib/field-view-settings";
import { FieldSettings } from "./field-settings";
import { getAvailabilityMatch } from "@/lib/availability";
import { isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { getMatchPhase } from "@/lib/match-phase";
import { matchLabelWithTime } from "@/lib/format";
import { MatchPageHeader } from "../match-page-header";

export const metadata = {
  title: "Draft · Sideline",
};

// Draft state is read live on every request.
export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  const canEdit = await isAdminView(role === "admin" || role === "super");

  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  // Draft management is admin-only; players view teams on the match page.
  if (!canEdit) {
    redirect(`/matches/${matchId}`);
  }

  const [state, publishedAt, fieldFeatures, availability, lockEnabled] = await Promise.all([
    getDraftState(matchId),
    getTeamsPublishedAt(matchId),
    getFieldFeatures(),
    getAvailabilityMatch(matchId),
    isAvailabilityLockEnabled(),
  ]);
  if (!state || !availability) notFound();
  const phase = getMatchPhase({
    matchdayStatus: state.matchdayStatus,
    availabilityOpen: availability.availabilityOpen,
    kickoffAt: availability.kickoffAt,
    lockEnabled,
    hasRoster: state.players.some((p) => p.teamNo != null),
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <MatchPageHeader
        matchId={matchId}
        dateLabel={matchLabelWithTime(availability.playedOn, availability.matchTime)}
        title="Lineup builder"
        phase={phase}
      />
      <MatchNav matchId={matchId} isAdmin={true} />

      <p className="mt-1 text-sm text-neutral-500">
        {canEdit
          ? "Drag players onto the pitch to set their team and position, or auto-balance by score."
          : "Read-only view. Only admins can edit the draft."}
      </p>

      <PublishTeams matchId={state.matchId} publishedAt={publishedAt} />

      <FieldSettings
        matchId={state.matchId}
        numTeams={state.numTeams}
        teamNames={state.teamNames}
        teamColors={state.teamColors}
        features={fieldFeatures}
      />

      <PitchBoard
        matchId={state.matchId}
        numTeams={state.numTeams}
        players={state.players}
        canEdit={canEdit}
        teamNames={state.teamNames}
      />
    </main>
  );
}
