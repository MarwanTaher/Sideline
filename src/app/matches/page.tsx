import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchList, fmtDate, fmtMatchTime } from "@/lib/matches";
import { SectionIcon } from "@/components/section-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchesList } from "./matches-list";

export const metadata = {
  title: "Matches · Sideline",
};

// Match data is read live on every request.
export const dynamic = "force-dynamic";



export default async function MatchesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  const playerId = session.user.playerId;

  const matches = await getMatchList(isAdmin ? undefined : playerId ?? -1);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <SectionIcon name="matches" className="h-9 w-9" />
            <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {matches.length} match{matches.length === 1 ? "" : "es"} total.
          </p>
        </div>
        {isAdmin ? (
          <Link
            href="/matches/new"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition active:scale-[0.98] hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            + New match
          </Link>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No matches yet"
          action={
            isAdmin ? (
              <Link
                href="/matches/new"
                className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                + Create the first match
              </Link>
            ) : null
          }
        >
          {isAdmin
            ? "Create a match to open availability and start collecting responses."
            : "Check back once an admin schedules the next match."}
        </EmptyState>
      ) : (
        <MatchesList
          items={matches.map((m) => ({
            id: m.id,
            matchdayStatus: m.matchdayStatus,
            closed: m.status === "closed",
            playerCount: m.playerCount,
            statsScoringEnabled: m.statsScoringEnabled,
            dateLabel: `${fmtDate(m.playedOn)} at ${fmtMatchTime(m.matchTime)}`,
          }))}
        />
      )}
    </main>
  );
}
