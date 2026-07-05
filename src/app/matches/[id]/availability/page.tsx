import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { fmtDate, fmtMatchTime } from "@/lib/matches";
import {
  getAvailabilityMatch,
  getAvailabilityAllPlayers,
  summarize,
  availabilityOpen,
  type MatchdayStatus,
  type PlayerAvailability,
} from "@/lib/availability";
import { AvailabilityControls } from "./availability-controls";
import { MatchNav } from "../match-nav";

export const metadata = {
  title: "Availability · Sideline",
};

// Availability is read live on every request.
export const dynamic = "force-dynamic";

const MATCHDAY_BADGE: Record<MatchdayStatus, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  closed: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

function StatusList({ title, players }: { title: ReactNode; players: PlayerAvailability[] }) {
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-neutral-400">({players.length})</span>
      </h3>
      {players.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-400">None</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {players.map((p) => (
            <li key={p.playerId} className="flex items-center justify-between">
              <span className="truncate">{p.name}</span>
              {p.preferredPosition ? (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {p.preferredPosition}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AvailabilityPage({
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

  const match = await getAvailabilityMatch(matchId);
  if (!match) notFound();

  const players = await getAvailabilityAllPlayers(matchId);
  const summary = summarize(players);
  const open = availabilityOpen(match.matchdayStatus);

  const inPlayers = players.filter((p) => p.status === "in");
  const outPlayers = players.filter((p) => p.status === "out");
  const pendingPlayers = players.filter((p) => p.status === "pending");

  const myPlayerId = session.user.playerId;
  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const mine = myPlayerId == null ? null : players.find((p) => p.playerId === myPlayerId);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Match {matchId}
      </Link>

      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${MATCHDAY_BADGE[match.matchdayStatus]}`}
        >
          {match.matchdayStatus}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Match {match.id} · {fmtDate(match.playedOn)} at {fmtMatchTime(match.matchTime)}
      </p>

      {myPlayerId != null ? (
        <section className="mt-6">
          <AvailabilityControls
            matchId={matchId}
            currentStatus={mine?.status ?? "pending"}
            open={open}
          />
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
          Admin accounts can view responses but cannot set availability.
        </p>
      )}

      <section className="mt-8">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-black/10 p-4 text-center dark:border-white/10">
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {summary.inCount}
            </div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">In</div>
          </div>
          <div className="rounded-xl border border-black/10 p-4 text-center dark:border-white/10">
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
              {summary.outCount}
            </div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Out</div>
          </div>
          <div className="rounded-xl border border-black/10 p-4 text-center dark:border-white/10">
            <div className="text-2xl font-semibold text-neutral-500">{summary.pendingCount}</div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Pending</div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatusList title={<><span aria-hidden="true">✅</span> In</>} players={inPlayers} />
        <StatusList title={<><span aria-hidden="true">❌</span> Out</>} players={outPlayers} />
        <StatusList title={<><span aria-hidden="true">⏳</span> Pending</>} players={pendingPlayers} />
      </section>
    </main>
  );
}
