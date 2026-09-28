import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { fmtDate, fmtMatchTime } from "@/lib/matches";
import {
  getAvailabilityMatch,
  getAvailabilityAllPlayers,
  getWaitlistPlayers,
  summarize,
  type MatchdayStatus,
  type PlayerAvailability,
} from "@/lib/availability";
import { isWaitlistAutoPromoteEnabled, isWaitlistVisibleToPlayers, isVoteGateEnabled, isAvailabilityLockEnabled } from "@/lib/feature-settings";
import { isWithinAvailabilityLock } from "@/lib/match-schedule";
import { AvailabilityControls } from "./availability-controls";
import {
  AvailabilityOpenToggle,
  MaxPlayersForm,
  AdminPlayerControls,
  WaitlistToggle,
  VoteGateToggle,
  AvailabilityLockToggle,
} from "./availability-admin";
import { AddGuestForm, GuestList, AdminAddGuestForm } from "./guest-controls";
import { listGuests, MAX_GUESTS_PER_HOST, type Guest } from "@/lib/guests";
import { MatchNav } from "../match-nav";
import { SectionIcon } from "@/components/section-icon";
import { Avatar } from "@/components/ui/avatar";

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
  dim = false,
}: {
  title: ReactNode;
  players: PlayerAvailability[];
  guests?: Guest[];
  dim?: boolean;
}) {
  const total = players.length + guests.length;
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-neutral-400">({total})</span>
      </h3>
      {total === 0 ? (
        <p className="mt-2 text-xs text-neutral-400">None</p>
      ) : (
        <ul className={`mt-2 space-y-1 text-sm ${dim ? "opacity-[0.55]" : ""}`}>
          {players.map((p) => (
            <li key={p.playerId} className="flex items-center gap-2">
              <Link
                href={`/players/${p.playerId}`}
                className="flex min-w-0 flex-1 items-center gap-2 transition hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <Avatar name={p.name} photoUrl={p.photoUrl} size="xs" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
              </Link>
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

  // 24h availability lock (admin-toggled). Players can't change within 24h of
  // kickoff; admins always can.
  const availabilityLockEnabled = await isAvailabilityLockEnabled();
  const availabilityLocked =
    availabilityLockEnabled && isWithinAvailabilityLock(match.playedOn, match.matchTime);

  const inPlayers = players.filter((p) => p.status === "in");
  const outPlayers = players.filter((p) => p.status === "out");
  const pendingPlayers = players.filter((p) => p.status === "pending");

  const myPlayerId = session.user.playerId;
  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const mine = myPlayerId == null ? null : players.find((p) => p.playerId === myPlayerId);

  const guests = await listGuests(matchId);
  const approvedGuests = guests.filter((g) => g.status === "approved");
  const pendingGuests = guests.filter((g) => g.status === "pending");
  const myGuests = myPlayerId == null ? [] : guests.filter((g) => g.hostPlayerId === myPlayerId);

  const [waitlistEnabled, waitlistPlayers, waitlistVisible, voteGateEnabled] = isAdmin
    ? await Promise.all([
        isWaitlistAutoPromoteEnabled(),
        getWaitlistPlayers(matchId),
        isWaitlistVisibleToPlayers(),
        isVoteGateEnabled(),
      ])
    : [false, [], false, false];

  // Non-admin players only see the waitlist when the admin has made it visible.
  const publicWaitlist =
    !isAdmin && (await isWaitlistVisibleToPlayers())
      ? await getWaitlistPlayers(matchId)
      : [];

  // Players an admin can still add to the waitlist: not already IN and not queued.
  const waitlistedIds = new Set(waitlistPlayers.map((w) => w.playerId));
  const waitlistCandidates = players
    .filter((p) => p.status !== "in" && !waitlistedIds.has(p.playerId))
    .map((p) => ({ playerId: p.playerId, name: p.name }));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Match {matchId}
      </Link>

      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <SectionIcon name="availability" className="h-9 w-9" />
          <h1 className="text-2xl font-bold tracking-tight">Availability</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${MATCHDAY_BADGE[match.matchdayStatus]}`}
          >
            {match.matchdayStatus}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Match {match.id} · {fmtDate(match.playedOn)} at {fmtMatchTime(match.matchTime)}
        </p>
        {match.maxPlayers ? (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
              <span>{inPlayers.length >= match.maxPlayers ? "Match full" : "Spots filled"}</span>
              <span className="tabular-nums">{inPlayers.length}/{match.maxPlayers}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className={`h-full rounded-full ${inPlayers.length >= match.maxPlayers ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, (inPlayers.length / match.maxPlayers) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {myPlayerId != null ? (
        <section className="mt-6">
          <AvailabilityControls
            matchId={matchId}
            currentStatus={mine?.status ?? "pending"}
            open={open}
            locked={availabilityLocked}
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
            Request up to {MAX_GUESTS_PER_HOST} guests. Requests are approved by an admin before they join the draft.
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

      {publicWaitlist.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold">Waitlist ({publicWaitlist.length})</h2>
          <p className="mt-1 text-xs text-neutral-500">
            If the match is full, spots open up in this order.
          </p>
          <ol className="mt-3 space-y-1">
            {publicWaitlist.map((w, i) => {
              const isMe = w.playerId === myPlayerId;
              return (
                <li
                  key={w.playerId}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                    isMe
                      ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : ""
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                      i === 0
                        ? "bg-amber-500 text-white"
                        : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {w.name}
                    {isMe ? " (you)" : ""}
                  </span>
                  {i === 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      Next up
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {isAdmin ? (
        <details className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-semibold">
            Availability control (admin)
          </summary>
          <p className="mt-2 text-xs text-neutral-500">
            Open or close responses, set the player cap, and mark players in or out.
          </p>
          <div className="mt-3 space-y-4">
            <AvailabilityOpenToggle matchId={matchId} open={open} />
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <MaxPlayersForm matchId={matchId} maxPlayers={match.maxPlayers} />
            </div>
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <h3 className="mb-2 text-sm font-medium">Waitlist</h3>
              <WaitlistToggle
                matchId={matchId}
                enabled={waitlistEnabled}
                visibleToPlayers={waitlistVisible}
                waitlist={waitlistPlayers}
                candidates={waitlistCandidates}
              />
            </div>
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <h3 className="mb-2 text-sm font-medium">Vote-gate</h3>
              <VoteGateToggle matchId={matchId} enabled={voteGateEnabled} />
            </div>
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <h3 className="mb-2 text-sm font-medium">Lock 24h before kickoff</h3>
              <AvailabilityLockToggle matchId={matchId} enabled={availabilityLockEnabled} />
            </div>
            <div className="border-t border-black/5 pt-4 dark:border-white/5">
              <h3 className="mb-2 text-sm font-medium">Set player availability</h3>
              <AdminPlayerControls matchId={matchId} players={players} />
            </div>
          </div>
        </details>
      ) : null}

      {isAdmin ? (
        <details className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10" open={pendingGuests.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">
            Guests &amp; requests (admin)
            {pendingGuests.length > 0 ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                {pendingGuests.length} pending
              </span>
            ) : null}
          </summary>
          <p className="mt-2 text-xs text-neutral-500">
            Approve or decline guest requests, add a guest on behalf of a player, or remove any guest.
          </p>
          {pendingGuests.length > 0 ? (
            <div className="mt-3">
              <h3 className="mb-2 text-sm font-medium">Pending requests</h3>
              <GuestList
                matchId={matchId}
                guests={pendingGuests}
                showHost
                canRemove={false}
                canApprove
              />
            </div>
          ) : null}
          <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/5">
            <AdminAddGuestForm
              matchId={matchId}
              hosts={inPlayers.map((p) => ({ playerId: p.playerId, name: p.name }))}
              open={open}
            />
          </div>
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium">Approved guests</h3>
            <GuestList matchId={matchId} guests={approvedGuests} showHost canRemove />
          </div>
        </details>
      ) : null}

      <section className="mt-8">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-black/10 p-4 text-center dark:border-white/10">
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {summary.inCount + approvedGuests.length}
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
        <StatusList title={<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> In</span>} players={inPlayers} guests={approvedGuests} />
        <StatusList title={<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Out</span>} players={outPlayers} dim />
        <StatusList title={<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-neutral-400" /> Pending</span>} players={pendingPlayers} />
      </section>
    </main>
  );
}
