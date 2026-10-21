import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getDraftState } from "@/lib/draft";
import { PitchBoard } from "./pitch-board";
import { MatchNav } from "../match-nav";
import { PublishTeams } from "./publish-teams";
import { getTeamsPublishedAt } from "@/lib/moments";

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

  const [state, publishedAt] = await Promise.all([getDraftState(matchId), getTeamsPublishedAt(matchId)]);
  if (!state) notFound();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Back to match
      </Link>

      <MatchNav matchId={matchId} isAdmin={true} />

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Lineup builder</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {canEdit
          ? "Drag players onto the pitch to set their team and position, or auto-balance by score."
          : "Read-only view. Only admins can edit the draft."}
      </p>

      <PublishTeams matchId={state.matchId} publishedAt={publishedAt} />

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
