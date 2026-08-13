import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getMatchList, fmtDate, fmtMatchTime, type MatchdayStatus } from "@/lib/matches";
import { SectionIcon } from "@/components/section-icon";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = {
  title: "Matches · Sideline",
};

// Match data is read live on every request.
export const dynamic = "force-dynamic";

const MATCHDAY_BADGE: Record<MatchdayStatus, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  closed: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

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
        <ul className="mt-6 space-y-3">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/matches/${m.id}`}
                className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Match {m.id}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${MATCHDAY_BADGE[m.matchdayStatus]}`}
                    >
                      {m.matchdayStatus}
                    </span>
                    {m.status === "closed" ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        closed
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-neutral-500">
                    {fmtDate(m.playedOn)} at {fmtMatchTime(m.matchTime)}
                  </div>
                </div>
                <div className="text-right text-sm text-neutral-500">
                  <div>
                    {m.playerCount} player{m.playerCount === 1 ? "" : "s"}
                  </div>
                  {m.statsScoringEnabled ? (
                    <div className="text-xs text-neutral-400">stats scoring on</div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
