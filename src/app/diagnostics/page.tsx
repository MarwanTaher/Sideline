import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { isTabLockedForCurrentUser } from "@/lib/admin-access";
import { getDiagnostics } from "@/lib/diagnostics";
import { SectionIcon } from "@/components/section-icon";
import { CheckIcon, XIcon } from "@/components/ui/icons";

export const metadata = {
  title: "DB diagnostics · Sideline",
};

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] p-4 shadow-sm dark:border-white/10">
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

      <section className="mt-6 rounded-2xl border border-black/[0.06] p-4 dark:border-white/10">
        <h2 className="text-sm font-semibold">Admin data exports</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Download CSVs for matches, current scores, season invoices, or the fund ledger.
          These exports do not include login credentials or access tokens.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["matches", "Matches"],
            ["scores", "Scores"],
            ["invoices", "Season invoices"],
            ["fund-ledger", "Fund ledger"],
          ].map(([dataset, label]) => (
            <a
              key={dataset}
              href={`/api/admin/export/${dataset}`}
              className="inline-flex rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800"
            >
              Export {label}
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Full database backups still require a separately scheduled Neon branch snapshot.
        </p>
      </section>

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
                  <td className="py-2 pr-4">{r.statsOn ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <XIcon className="h-4 w-4 text-neutral-400" />}</td>
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

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Recent server errors</h2>
        {!d.errorLogAvailable ? (
          <p className="mt-2 text-sm text-neutral-500">
            Error logging is unavailable until migration 0030 is deployed.
          </p>
        ) : d.latestErrors.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No server errors have been recorded.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {d.latestErrors.map((entry) => (
              <article
                key={entry.id}
                className="rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/10"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium">{entry.errorName} · {entry.source}</span>
                  <time className="text-xs text-neutral-500">{entry.occurredAt}</time>
                </div>
                <p className="mt-1 break-words text-xs text-neutral-600 dark:text-neutral-300">
                  {entry.message}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
