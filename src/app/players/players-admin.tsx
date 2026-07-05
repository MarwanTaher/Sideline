"use client";

import { useEffect, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activatePlayerAction,
  addPlayerAction,
  approveResetAction,
  bulkEditAction,
  bulkRemoveAction,
  deletePlayerAction,
  dismissResetAction,
  generateMagicLinkAction,
  revokeMagicLinksAction,
  importCsvAction,
  savePlayerAction,
  type PlayerActionState,
} from "./actions";
import { POSITIONS } from "@/lib/positions";
import type { PlayerRow, ResetRequestRow } from "@/lib/players-admin";

const INITIAL: PlayerActionState = { ok: false, message: "" };

const inputCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";
const btnPrimary =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
const btnGhost =
  "rounded-lg border border-black/15 px-3 py-2 text-sm font-medium transition hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5";

function useRefreshOnOk(state: PlayerActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

function Banner({ state }: { state: PlayerActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        state.ok
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      <div>{state.message}</div>
      {state.link && (
        <code className="mt-1 block break-all rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
          {state.link}
        </code>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-3 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ResetRequestCard({ req }: { req: ResetRequestRow }) {
  const [approveState, approve, approving] = useActionState(approveResetAction, INITIAL);
  const [dismissState, dismiss, dismissing] = useActionState(dismissResetAction, INITIAL);
  useRefreshOnOk(dismissState);
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="text-sm font-medium">
        {req.name}
        <span className="ml-2 text-xs font-normal text-neutral-500">
          requested {req.requestedAt}
        </span>
      </div>
      {req.existingToken && !approveState.link && (
        <p className="mt-1 text-xs text-neutral-500">
          A valid reset link already exists — regenerate below if needed.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <form action={approve}>
          <input type="hidden" name="playerId" value={req.playerId} />
          <button type="submit" disabled={approving} className={btnPrimary}>
            {approving ? "Generating…" : "Approve — generate link"}
          </button>
        </form>
        <form action={dismiss}>
          <input type="hidden" name="requestId" value={req.id} />
          <button type="submit" disabled={dismissing} className={btnGhost}>
            {dismissing ? "…" : "Dismiss"}
          </button>
        </form>
      </div>
      <Banner state={approveState} />
      <Banner state={dismissState} />
    </div>
  );
}

function ActivateForm({ player }: { player: PlayerRow }) {
  const [state, action, pending] = useActionState(activatePlayerAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="playerId" value={player.id} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "…" : "Activate"}
      </button>
    </form>
  );
}

function PlayerCard({ player }: { player: PlayerRow }) {
  const [saveState, save, saving] = useActionState(savePlayerAction, INITIAL);
  const [delState, del, deleting] = useActionState(deletePlayerAction, INITIAL);
  const [magicState, magic, magicPending] = useActionState(generateMagicLinkAction, INITIAL);
  const [revokeState, revoke, revoking] = useActionState(revokeMagicLinksAction, INITIAL);
  const [open, setOpen] = useState(false);
  useRefreshOnOk(saveState);
  useRefreshOnOk(delState);
  useRefreshOnOk(revokeState);
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
      >
        <span>
          <span
            aria-hidden="true"
            className={player.active ? "text-emerald-600" : "text-red-500"}
          >
            ●
          </span>
          <span className="sr-only">{player.active ? "Active" : "Inactive"}</span>{" "}
          <span className="font-medium">{player.name}</span>
          <span className="ml-2 text-neutral-500">{player.preferredPosition}</span>
          {player.hasPassword && (
            <span className="ml-2 text-xs text-neutral-400">
              <span aria-hidden="true">🔒</span> password set
            </span>
          )}
          {player.activeLinkCount > 0 && (
            <span className="ml-2 text-xs text-neutral-400">
              <span aria-hidden="true">🔗</span> {player.activeLinkCount} active link
              {player.activeLinkCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-black/10 px-4 py-4 dark:border-white/10">
          <form action={save} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="playerId" value={player.id} />
            <label className="block text-sm">
              <span className="font-medium">Position</span>
              <select name="position" defaultValue={player.preferredPosition} className={inputCls}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={player.active} />
              <span className="font-medium">Active</span>
            </label>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
          <Banner state={saveState} />

          <form action={magic} className="mt-4">
            <input type="hidden" name="playerId" value={player.id} />
            <button type="submit" disabled={magicPending} className={btnGhost}>
              {magicPending ? "Generating…" : "Generate magic sign-in link"}
            </button>
          </form>
          <Banner state={magicState} />

          <form action={revoke} className="mt-3">
            <input type="hidden" name="playerId" value={player.id} />
            <button
              type="submit"
              disabled={revoking || player.activeLinkCount === 0}
              className={btnGhost}
            >
              {revoking
                ? "Revoking…"
                : player.activeLinkCount > 0
                  ? `Revoke all links (${player.activeLinkCount})`
                  : "No active links"}
            </button>
          </form>
          <Banner state={revokeState} />

          <form action={del} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="playerId" value={player.id} />
            <label className="block text-sm">
              <span className="font-medium text-red-600">Type DELETE to remove</span>
              <input name="confirm" placeholder="DELETE" className={inputCls} />
            </label>
            <button
              type="submit"
              disabled={deleting}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              {deleting ? "Removing…" : "Remove player"}
            </button>
          </form>
          <Banner state={delState} />
        </div>
      )}
    </div>
  );
}

function AddPlayerForm() {
  const [state, action, pending] = useActionState(addPlayerAction, INITIAL);
  useRefreshOnOk(state);
  return (
    <form action={action} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="font-medium">Player name</span>
          <input name="name" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Preferred position</span>
          <select name="position" defaultValue="MID" className={inputCls}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Adding…" : "Add player"}
        </button>
      </div>
      <Banner state={state} />
    </form>
  );
}

function ImportExportBulk({ players }: { players: PlayerRow[] }) {
  const [importState, importAction, importing] = useActionState(importCsvAction, INITIAL);
  const [bulkState, bulkAction, bulkPending] = useActionState(bulkEditAction, INITIAL);
  const [removeState, removeAction, removing] = useActionState(bulkRemoveAction, INITIAL);
  const [csv, setCsv] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  useRefreshOnOk(importState);
  useRefreshOnOk(bulkState);
  useRefreshOnOk(removeState);

  function exportCsv() {
    const header = "id,name,preferred_position,active";
    const body = players
      .map((p) => `${p.id},"${p.name.replace(/"/g, '""')}",${p.preferredPosition},${p.active ? 1 : 0}`)
      .join("\n");
    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `players_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const idsValue = selected.join(",");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <h3 className="text-sm font-medium">Export</h3>
          <button type="button" onClick={exportCsv} className={`mt-3 ${btnGhost}`}>
            Download CSV
          </button>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <h3 className="text-sm font-medium">Import</h3>
          <input type="file" accept=".csv" onChange={onFile} className="mt-3 block w-full text-sm" />
          <form action={importAction} className="mt-3">
            <textarea
              name="csv"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="name,preferred_position,active"
              rows={4}
              className={`${inputCls} font-mono text-xs`}
            />
            <button type="submit" disabled={importing} className={`mt-3 ${btnPrimary}`}>
              {importing ? "Importing…" : "Import players"}
            </button>
          </form>
          <Banner state={importState} />
        </div>
      </div>

      <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-medium">Bulk actions</h3>
        <p className="mt-1 text-xs text-neutral-500">
          {selected.length} selected. Choose players, then apply an edit or remove them.
        </p>
        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-black/10 p-2 dark:border-white/10">
          {players.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span>
                {p.name} <span className="text-neutral-400">#{p.id}</span>
              </span>
            </label>
          ))}
        </div>

        <form action={bulkAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="ids" value={idsValue} />
          <label className="block text-sm">
            <span className="font-medium">Set active</span>
            <select name="activeChoice" defaultValue="no-change" className={inputCls}>
              <option value="no-change">No change</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Set position</span>
            <select name="positionChoice" defaultValue="no-change" className={inputCls}>
              <option value="no-change">No change</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={bulkPending || selected.length === 0} className={btnPrimary}>
            {bulkPending ? "Applying…" : "Apply bulk edits"}
          </button>
        </form>
        <Banner state={bulkState} />

        <form action={removeAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="ids" value={idsValue} />
          <label className="block text-sm">
            <span className="font-medium text-red-600">Type DELETE to remove selected</span>
            <input name="confirm" placeholder="DELETE" className={inputCls} />
          </label>
          <button
            type="submit"
            disabled={removing || selected.length === 0}
            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-950/30"
          >
            {removing ? "Removing…" : "Remove selected"}
          </button>
        </form>
        <Banner state={removeState} />
      </div>
    </div>
  );
}

export default function PlayersAdmin({
  players,
  activeCount,
  inactiveCount,
  resetRequests,
}: {
  players: PlayerRow[];
  activeCount: number;
  inactiveCount: number;
  resetRequests: ResetRequestRow[];
}) {
  const [search, setSearch] = useState("");
  const inactive = players.filter((p) => !p.active);
  const filtered = search
    ? players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : players;

  return (
    <div className="mt-6 space-y-8">
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Total players" value={players.length} />
        <Metric label="Active" value={activeCount} />
        <Metric label="Pending activation" value={inactiveCount} />
      </div>

      {resetRequests.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            🔑 Password reset requests ({resetRequests.length})
          </h2>
          <div className="mt-3 space-y-3">
            {resetRequests.map((req) => (
              <ResetRequestCard key={req.id} req={req} />
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Pending activation ({inactive.length})
          </h2>
          <div className="mt-3 space-y-2">
            {inactive.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/10"
              >
                <span>
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-neutral-500">({p.preferredPosition})</span>
                </span>
                <ActivateForm player={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Add player</h2>
        <div className="mt-3">
          <AddPlayerForm />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Roster ({players.length})</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name…"
          className={`${inputCls} mt-3 max-w-sm`}
        />
        <div className="mt-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-500">No players match your search.</p>
          ) : (
            filtered.map((p) => <PlayerCard key={p.id} player={p} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Import / Export &amp; bulk actions</h2>
        <div className="mt-3">
          <ImportExportBulk players={players} />
        </div>
      </section>
    </div>
  );
}
