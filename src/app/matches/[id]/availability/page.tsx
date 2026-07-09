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
  type MatchdayStatus,
  type PlayerAvailability,
} from "@/lib/availability";
import { AvailabilityControls } from "./availability-controls";
import {
  AvailabilityOpenToggle,
  MaxPlayersForm,
  AdminPlayerControls,
} from "./availability-admin";
import { AddGuestForm, GuestList, AdminAddGuestForm } from "./guest-controls";
import { listGuests, MAX_GUESTS_PER_HOST, type Guest } from "@/lib/guests";
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

function StatusList({
  title,
  players,
  guests = [],
}: {
  title: ReactNode;
  players: PlayerAvailability[];
  guests?: Guest[];
}) {
  const total = players.length + guests.length;
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-neutral-400">({total})</span>
      </h3>
      {total === 0 ? (
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
          {guests.map((g) => (
            <li key={`g-${g.id}`} className="flex items-center justify-between">
              <span className="truncate">
                <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  Guest
                </span>
                {g.name}
                <span className="text-xs text-neutral-500"> · of {g.hostName}</span>
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {g.position}
              </span>
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
  const open = match.availabilityOpen;

  const inPlayers = players.filter((p) => p.status === "in");
  const outPlayers = players.filter((p) => p.status === "out");
  const pendingPlayers = players.filter((p) => p.status === "pending");

  const myPlayerId = session.user.playerId;
  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const mine = myPlayerId == null ? null : players.find((p) => p.playerId === myPlayerId);

  const guests = await listGuests(matchId);
  const myGuests = myPlayerId == null ? [] : guests.filter((g) => g.hostPlayerId === myPlayerId);

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

      {myPlayerId != null ? (
        <details className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-semibold">
            Do you want to bring a guest?
          </summary>
          <p className="mt-2 text-xs text-neutral-500">
            Add up to {MAX_GUESTS_PER_HOST} guests you are bringing. Guests join the draft.
          </p>
          <div className="mt-3">
            <GuestList matchId={matchId} guests={myGuests} canRemove={open} />
          </div>
          <div className="mt-4">
            <AddGuestForm
              matchId={matchId}
              remaining={MAX_GUESTS_PER_HOST - myGuests.length}
              open={open}
            />
          </div>
        </details>
      ) : null}

      {isAdmin ? (
        <section className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-semibold">Availability (admin)</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Open or close responses, set the player cap, and mark players in or out.
          </p>
          <div className="mt-3 space-y-4">
            <AvailabilityOpenToggle matchId={matchId} open={open} />
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <MaxPlayersForm matchId={matchId} maxPlayers={match.maxPlayers} />
            </div>
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <h3 className="mb-2 text-sm font-medium">Set player availability</h3>
              <AdminPlayerControls matchId={matchId} players={players} />
            </div>
          </div>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-semibold">Guests (admin)</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Add a guest on behalf of a player, or remove any guest.
          </p>
          <div className="mt-3">
            <AdminAddGuestForm
              matchId={matchId}
              hosts={inPlayers.map((p) => ({ playerId: p.playerId, name: p.name }))}
              open={open}
            />
          </div>
          <div className="mt-4">
            <GuestList matchId={matchId} guests={guests} showHost canRemove />
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-black/10 p-4 text-center dark:border-white/10">
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {summary.inCount + guests.length}
            </div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              In <span className="normal-case text-neutral-400">/ {match.maxPlayers} max</span>
            </div>
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
        <StatusList title={<><span aria-hidden="true">✅</span> In</>} players={inPlayers} guests={guests} />
        <StatusList title={<><span aria-hidden="true">❌</span> Out</>} players={outPlayers} />
        <StatusList title={<><span aria-hidden="true">⏳</span> Pending</>} players={pendingPlayers} />
      </section>
    </main>
  );
}
