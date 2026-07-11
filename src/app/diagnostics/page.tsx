import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import { getDiagnostics } from "@/lib/diagnostics";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "DB diagnostics · Sideline",
};

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function DiagnosticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin =
    (await isAdminView(role === "admin" || role === "super")) &&
    !(await isTabLockedForCurrentUser("diagnostics"));
  if (!isAdmin) redirect("/leaderboard");

  const d = await getDiagnostics();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="diagnostics" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Scoring DB diagnostics</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        A read-only health check of the data the scoring engine depends on.
      </p>

      {d.warnings.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {d.warnings.map((w, i) => (
            <li
              key={i}
              className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
              {w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          No issues detected. Stats and votes are feeding into scoring.
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total votes" value={d.totalVotes} />
        <Stat label="Valid (in-scope) votes" value={d.validVotes} />
        <Stat label="match_players rows" value={d.matchPlayers} />
        <Stat label="stats table rows" value={d.stats} />
        <Stat label="Submissions (total)" value={d.submissionsTotal} />
        <Stat label="Submissions (approved)" value={d.submissionsApproved} />
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        Matches with stats scoring enabled: {d.matchesStatsOn} / {d.matchesTotal}. Total goals in stats
        table: {d.goalsSum} | Total assists: {d.assistsSum}.
      </p>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Per-match breakdown</h2>
      {d.perMatch.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">No matches.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-2 pr-4">Match ID</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Stats ON</th>
                <th className="py-2 pr-4">Players</th>
                <th className="py-2 pr-4">Stats rows</th>
                <th className="py-2 pr-4">Approved subs</th>
                <th className="py-2 pr-4">Votes</th>
              </tr>
            </thead>
            <tbody>
              {d.perMatch.map((r) => (
                <tr key={r.matchId} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{r.matchId}</td>
                  <td className="py-2 pr-4">{r.playedOn}</td>
                  <td className="py-2 pr-4">{r.statsOn ? "✅" : "❌"}</td>
                  <td className="py-2 pr-4">{r.players}</td>
                  <td className="py-2 pr-4">{r.statsRows}</td>
                  <td className="py-2 pr-4">{r.approvedSubs}</td>
                  <td className="py-2 pr-4">{r.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Scoring engine stat query test</h2>
      <p className="mt-2 text-sm text-neutral-500">
        Stat rows returned by the engine query: <span className="font-semibold">{d.engineStatRows}</span>.
        Total goals in those rows: {d.engineGoalsTotal} | Total assists: {d.engineAssistsTotal}.
      </p>
    </main>
  );
}
