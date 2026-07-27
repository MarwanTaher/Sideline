"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  addVoteAction,
  applyAutoFlagAction,
  deleteVoteAction,
  editVoteAction,
  excludeVoteAction,
  previewAutoFlagAction,
  resetVoteAction,
  type AutoFlagState,
  type VoteActionState,
} from "./actions";
import { SCOPE_OPTIONS } from "@/lib/vote-admin-constants";
import type {
  MatchOption,
  OutlierSensitivity,
  ParticipantOption,
  VoteAuditRow,
  VoteReviewCounts,
  VoteReviewRow,
  VoteSubmissionRow,
} from "@/lib/vote-admin";
import type { MotmTallyRow, MotmVoteDetailRow } from "@/lib/motm";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";

const INITIAL: VoteActionState = { ok: false, message: "" };

const TABS = ["Votes Table", "Submissions", "MOTM Votes", "Edit Vote", "Add Vote", "Auto-flag", "Change Log"] as const;
type Tab = (typeof TABS)[number];

function Banner({ state }: { state: VoteActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        state.ok
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      {state.message}
    </p>
  );
}

function useRefreshOnOk(state: VoteActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

const inputCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";
const btnPrimary =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
const btnGhost =
  "rounded-lg border border-black/15 px-3 py-2 text-sm font-medium transition hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10";

function VoteKeyFields({ vote }: { vote: VoteReviewRow }) {
  return (
    <>
      <input type="hidden" name="matchId" value={vote.matchId} />
      <input type="hidden" name="voterId" value={vote.voterId} />
      <input type="hidden" name="votedForId" value={vote.votedForId} />
    </>
  );
}

function EditForm({ vote }: { vote: VoteReviewRow }) {
  const [state, action, pending] = useActionState(editVoteAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <VoteKeyFields vote={vote} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Rating (0–10)</span>
          <input type="number" name="rating" min={0} max={10} defaultValue={vote.rating} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Vote status</span>
          <select name="scopeStatus" defaultValue={vote.scopeStatus} className={inputCls}>
            {SCOPE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="include"
            defaultChecked={vote.includeInCalculation === 1}
            className="h-4 w-4"
          />
          <span>Counts toward score</span>
        </label>
      </div>
      <button type="submit" disabled={pending} className={`mt-3 ${btnPrimary}`}>
        {pending ? "Saving…" : "Apply edit"}
      </button>
      <Banner state={state} />
    </form>
  );
}

function ResetButton({ vote }: { vote: VoteReviewRow }) {
  const [state, action, pending] = useActionState(resetVoteAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action}>
      <VoteKeyFields vote={vote} />
      <button type="submit" disabled={pending} className={btnGhost}>
        Reset vote
      </button>
      <Banner state={state} />
    </form>
  );
}

function ExcludeButton({ vote }: { vote: VoteReviewRow }) {
  const [state, action, pending] = useActionState(excludeVoteAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action}>
      <VoteKeyFields vote={vote} />
      <button type="submit" disabled={pending} className={btnGhost}>
        Remove from calculation
      </button>
      <Banner state={state} />
    </form>
  );
}

function DeleteForm({ vote }: { vote: VoteReviewRow }) {
  const [state, action, pending] = useActionState(deleteVoteAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="rounded-xl border border-red-500/30 p-4">
      <VoteKeyFields vote={vote} />
      <p className="text-sm font-medium text-red-700 dark:text-red-300">Delete vote</p>
      <p className="mt-1 text-xs text-neutral-500">
        Removes this vote. If it&apos;s the voter&apos;s last vote for the match, their stat submission,
        approved stats and goal claim revert to pending. Type <span className="font-mono">DELETE</span> to
        confirm.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input type="text" name="confirm" placeholder="DELETE" className={`${inputCls} !mt-0 max-w-40`} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      <Banner state={state} />
    </form>
  );
}

function EditPanel({ votes }: { votes: VoteReviewRow[] }) {
  const [idx, setIdx] = useState(0);
  if (votes.length === 0) return <p className="text-sm text-neutral-500">No votes to edit for the selected match.</p>;
  const safeIdx = Math.min(idx, votes.length - 1);
  const vote = votes[safeIdx];
  const key = `${vote.matchId}-${vote.voterId}-${vote.votedForId}`;
  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium">Select vote record</span>
        <select value={safeIdx} onChange={(e) => setIdx(Number(e.target.value))} className={inputCls}>
          {votes.map((v, i) => (
            <option key={`${v.matchId}-${v.voterId}-${v.votedForId}`} value={i}>
              M{v.matchId} | {v.voterName} → {v.votedForName} | r={v.rating} | {v.scopeStatus}
            </option>
          ))}
        </select>
      </label>
      <div key={key} className="space-y-3">
        <EditForm vote={vote} />
        <div className="flex flex-wrap gap-3">
          <ResetButton vote={vote} />
          <ExcludeButton vote={vote} />
        </div>
        <DeleteForm vote={vote} />
      </div>
    </div>
  );
}

function AddPanel({
  matchId,
  participants,
}: {
  matchId: number;
  participants: ParticipantOption[];
}) {
  const [state, action, pending] = useActionState(addVoteAction, INITIAL);
  useRefreshOnOk(state);
  const [voterId, setVoterId] = useState<number | "">(participants[0]?.id ?? "");

  if (matchId === 0) {
    return <p className="text-sm text-neutral-500">Select a specific match above to add a vote.</p>;
  }
  if (participants.length === 0) {
    return <p className="text-sm text-neutral-500">No participants in this match yet.</p>;
  }
  const targets = participants.filter((p) => p.id !== voterId);
  return (
    <form action={action} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Voter</span>
          <select
            name="voterId"
            value={voterId}
            onChange={(e) => setVoterId(Number(e.target.value))}
            className={inputCls}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (#{p.id})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Voted for</span>
          <select name="votedForId" className={inputCls} key={String(voterId)}>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (#{p.id})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Rating (0–10)</span>
          <input type="number" name="rating" min={0} max={10} defaultValue={5} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Vote status</span>
          <select name="scopeStatus" defaultValue="in_scope" className={inputCls}>
            {SCOPE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="include" defaultChecked className="h-4 w-4" />
        <span>Counts toward score</span>
      </label>
      <button type="submit" disabled={pending} className={`mt-3 ${btnPrimary}`}>
        {pending ? "Saving…" : "Add or update vote"}
      </button>
      <Banner state={state} />
    </form>
  );
}

const AUTO_FLAG_INITIAL: AutoFlagState = {
  ok: false,
  message: "",
  candidates: null,
  sensitivity: null,
  matchId: null,
};

function SubmissionsPanel({
  selectedMatchId,
  submissions,
}: {
  selectedMatchId: number;
  submissions: VoteSubmissionRow[];
}) {
  if (selectedMatchId === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Select a specific match above to see who has voted and who hasn&apos;t.
      </p>
    );
  }
  if (submissions.length === 0) {
    return <p className="text-sm text-neutral-500">No players on the roster for this match.</p>;
  }

  const submitted = submissions.filter((s) => s.submitted);
  const missing = submissions.filter((s) => !s.submitted);

  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm">
        <div>
          <div className="text-xs text-neutral-500">Roster</div>
          <div className="text-lg font-semibold">{submissions.length}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Submitted</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {submitted.length}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Not yet</div>
          <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
            {missing.length}
          </div>
        </div>
      </div>

      <DataTable>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-2 pr-4">Player</th>
              <th scope="col" className="py-2 pr-4">Status</th>
              <th scope="col" className="py-2 pr-4">Ratings</th>
              <th scope="col" className="py-2 pr-4">Skips</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.playerId} className="border-t border-black/5 dark:border-white/5">
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 pr-4">
                  {s.submitted ? (
                    <Badge tone="success" dot>
                      voted
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      not yet
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-4">{s.ratings}</td>
                <td className="py-2 pr-4">{s.skips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}

function AutoFlagPanel({
  matches,
  selectedMatchId,
}: {
  matches: MatchOption[];
  selectedMatchId: number;
}) {
  const router = useRouter();
  const [previewState, previewAction, previewPending] = useActionState(
    previewAutoFlagAction,
    AUTO_FLAG_INITIAL,
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyAutoFlagAction,
    AUTO_FLAG_INITIAL,
  );
  const [matchId, setMatchId] = useState<number>(selectedMatchId);
  const [sensitivity, setSensitivity] = useState<OutlierSensitivity>("normal");

  useEffect(() => {
    if (applyState.ok) router.refresh();
  }, [applyState, router]);

  const candidates = previewState.candidates ?? [];
  const toFlag = candidates.filter((c) => !c.alreadyOutOfScope);
  // The Apply button reuses exactly what was previewed.
  const applyMatchId = previewState.matchId ?? matchId;
  const applySensitivity = previewState.sensitivity ?? sensitivity;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm text-neutral-500">
          Detect suspicious votes that differ strongly from the group for the same player in the same
          match. Buckets with fewer than 4 votes are skipped. Preview first, then apply. New votes are
          also scanned automatically as they come in.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Match to scan</span>
            <select
              value={matchId}
              onChange={(e) => setMatchId(Number(e.target.value))}
              className={inputCls}
            >
              <option value={0}>All matches</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Outlier sensitivity</span>
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value as OutlierSensitivity)}
              className={inputCls}
            >
              <option value="strict">strict (flags more)</option>
              <option value="normal">normal</option>
              <option value="lenient">lenient (flags fewer)</option>
            </select>
          </label>
        </div>
        <form action={previewAction} className="mt-3">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="sensitivity" value={sensitivity} />
          <button type="submit" disabled={previewPending} className={btnGhost}>
            {previewPending ? "Scanning…" : "Preview outliers"}
          </button>
        </form>
        <Banner state={previewState} />
      </div>

      {previewState.candidates != null ? (
        <div className="space-y-3">
          {candidates.length === 0 ? (
            <p className="text-sm text-neutral-500">No outliers found for this selection.</p>
          ) : (
            <DataTable>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Match</th>
                    <th scope="col" className="py-2 pr-4">Voter</th>
                    <th scope="col" className="py-2 pr-4">Voted for</th>
                    <th scope="col" className="py-2 pr-4">Rating</th>
                    <th scope="col" className="py-2 pr-4">Group median</th>
                    <th scope="col" className="py-2 pr-4">Accepted band</th>
                    <th scope="col" className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={`${c.matchId}-${c.voterId}-${c.votedForId}`}
                      className="border-t border-black/5 dark:border-white/5"
                    >
                      <td className="py-2 pr-4">{c.matchId}</td>
                      <td className="py-2 pr-4">{c.voterName}</td>
                      <td className="py-2 pr-4">{c.votedForName}</td>
                      <td className="py-2 pr-4 font-medium">{c.rating}</td>
                      <td className="py-2 pr-4">{c.median}</td>
                      <td className="py-2 pr-4 text-xs text-neutral-500">
                        {c.low.toFixed(1)} – {c.high.toFixed(1)}
                      </td>
                      <td className="py-2 pr-4">
                        {c.alreadyOutOfScope ? (
                          <Badge tone="neutral">already out</Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            will flag
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}

          {toFlag.length > 0 ? (
            <form action={applyAction}>
              <input type="hidden" name="matchId" value={applyMatchId} />
              <input type="hidden" name="sensitivity" value={applySensitivity} />
              <button type="submit" disabled={applyPending} className={btnPrimary}>
                {applyPending
                  ? "Applying…"
                  : `Apply — flag ${toFlag.length} vote${toFlag.length === 1 ? "" : "s"}`}
              </button>
            </form>
          ) : null}
          <Banner state={applyState} />
        </div>
      ) : null}
    </div>
  );
}

function scopeBadge(scope: string) {
  return (
    <Badge tone={scope === "in_scope" ? "success" : "warning"} dot>
      {scope}
    </Badge>
  );
}

function MotmPanel({
  selectedMatchId,
  tally,
  votes,
}: {
  selectedMatchId: number;
  tally: MotmTallyRow[];
  votes: MotmVoteDetailRow[];
}) {
  if (selectedMatchId <= 0) {
    return (
      <p className="text-sm text-neutral-500">
        Select a match above to review its Man of the Match votes.
      </p>
    );
  }
  if (tally.length === 0) {
    return <p className="text-sm text-neutral-500">No MOTM votes for this match yet.</p>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Tally</h3>
        <DataTable className="mt-2">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th scope="col" className="py-2 pr-4">#</th>
                <th scope="col" className="py-2 pr-4">Player</th>
                <th scope="col" className="py-2 pr-4">Votes</th>
              </tr>
            </thead>
            <tbody>
              {tally.map((t, i) => (
                <tr key={t.playerId} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{i === 0 ? "🏆" : i + 1}</td>
                  <td className={`py-2 pr-4 ${i === 0 ? "font-semibold" : ""}`}>{t.name}</td>
                  <td className="py-2 pr-4">{t.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Ballots</h3>
        <DataTable className="mt-2">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th scope="col" className="py-2 pr-4">Voter</th>
                <th scope="col" className="py-2 pr-4">Voted for</th>
                <th scope="col" className="py-2 pr-4">When</th>
              </tr>
            </thead>
            <tbody>
              {votes.map((v, i) => (
                <tr key={i} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{v.voterName}</td>
                  <td className="py-2 pr-4">{v.votedForName}</td>
                  <td className="py-2 pr-4 text-xs text-neutral-500">{v.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>
    </div>
  );
}

export function VotesAdmin({
  matches,
  selectedMatchId,
  votes,
  counts,
  audit,
  participants,
  submissions,
  motmTally,
  motmVotes,
}: {
  matches: MatchOption[];
  selectedMatchId: number;
  votes: VoteReviewRow[];
  counts: VoteReviewCounts;
  audit: VoteAuditRow[];
  participants: ParticipantOption[];
  submissions: VoteSubmissionRow[];
  motmTally: MotmTallyRow[];
  motmVotes: MotmVoteDetailRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Votes Table");

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm">
          <span className="font-medium">Filter by match</span>
          <select
            value={selectedMatchId}
            onChange={(e) => router.push(`/votes?match=${e.target.value}`)}
            className={inputCls}
          >
            <option value={0}>All matches</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-xs text-neutral-500">Total Votes</div>
            <div className="text-lg font-semibold">{counts.total}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">In Scope</div>
            <div className="text-lg font-semibold">{counts.inScope}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Exceptions</div>
            <div className="text-lg font-semibold">{counts.exceptions}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-b border-black/10 dark:border-white/10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-neutral-900 text-neutral-900 dark:border-white dark:text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Votes Table" ? (
          votes.length === 0 ? (
            <p className="text-sm text-neutral-500">No vote records found.</p>
          ) : (
            <DataTable>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Match</th>
                    <th scope="col" className="py-2 pr-4">Voter</th>
                    <th scope="col" className="py-2 pr-4">Voted for</th>
                    <th scope="col" className="py-2 pr-4">Rating</th>
                    <th scope="col" className="py-2 pr-4">Counts</th>
                    <th scope="col" className="py-2 pr-4">Status</th>
                    <th scope="col" className="py-2 pr-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {votes.map((v) => (
                    <tr
                      key={`${v.matchId}-${v.voterId}-${v.votedForId}`}
                      className="border-t border-black/5 dark:border-white/5"
                    >
                      <td className="py-2 pr-4">{v.matchId}</td>
                      <td className="py-2 pr-4">{v.voterName}</td>
                      <td className="py-2 pr-4">{v.votedForName}</td>
                      <td className="py-2 pr-4">{v.rating}</td>
                      <td className="py-2 pr-4">{v.includeInCalculation === 1 ? "yes" : "no"}</td>
                      <td className="py-2 pr-4">{scopeBadge(v.scopeStatus)}</td>
                      <td className="py-2 pr-4 text-xs text-neutral-500">{v.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )
        ) : null}

        {tab === "Edit Vote" ? <EditPanel votes={votes} /> : null}
        {tab === "Submissions" ? (
          <SubmissionsPanel selectedMatchId={selectedMatchId} submissions={submissions} />
        ) : null}
        {tab === "MOTM Votes" ? (
          <MotmPanel selectedMatchId={selectedMatchId} tally={motmTally} votes={motmVotes} />
        ) : null}
        {tab === "Add Vote" ? <AddPanel matchId={selectedMatchId} participants={participants} /> : null}
        {tab === "Auto-flag" ? <AutoFlagPanel matches={matches} selectedMatchId={selectedMatchId} /> : null}

        {tab === "Change Log" ? (
          audit.length === 0 ? (
            <p className="text-sm text-neutral-500">No admin vote changes logged yet.</p>
          ) : (
            <DataTable>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th scope="col" className="py-2 pr-4">When</th>
                    <th scope="col" className="py-2 pr-4">Who</th>
                    <th scope="col" className="py-2 pr-4">Action</th>
                    <th scope="col" className="py-2 pr-4">Match</th>
                    <th scope="col" className="py-2 pr-4">Vote</th>
                    <th scope="col" className="py-2 pr-4">Rating</th>
                    <th scope="col" className="py-2 pr-4">Include</th>
                    <th scope="col" className="py-2 pr-4">Scope</th>
                    <th scope="col" className="py-2 pr-4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((r, i) => (
                    <tr key={i} className="border-t border-black/5 dark:border-white/5">
                      <td className="py-2 pr-4 text-xs text-neutral-500">{r.changedAt}</td>
                      <td className="py-2 pr-4">{r.actor}</td>
                      <td className="py-2 pr-4">{r.action}</td>
                      <td className="py-2 pr-4">{r.matchId}</td>
                      <td className="py-2 pr-4">
                        {r.voterName} → {r.votedForName}
                      </td>
                      <td className="py-2 pr-4">
                        {r.oldRating ?? "—"} → {r.newRating ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {r.oldInclude ?? "—"} → {r.newInclude ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {r.oldScopeStatus ?? "—"} → {r.newScopeStatus ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-xs text-neutral-500">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )
        ) : null}
      </div>
    </div>
  );
}
