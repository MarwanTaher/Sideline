import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import {
  getAvailabilityMatch,
  getAvailabilityAllPlayers,
  getWaitlistPlayers,
} from "@/lib/availability";
import { isWaitlistAutoPromoteEnabled, isWaitlistVisibleToPlayers, isVoteGateEnabled, isAvailabilityLockEnabled, getLastNudgeAt, NUDGE_COOLDOWN_MS } from "@/lib/feature-settings";
import { AdminActionBar } from "./admin-quick";
import { isWithinAvailabilityLock, msUntilLock } from "@/lib/match-schedule";
import { matchLabelWithTime } from "@/lib/format";
import { getSubscriberIdsForMatch } from "@/lib/season-subscriptions";
import { AvailabilityControls } from "./availability-controls";
import {
  AvailabilityOpenToggle,
  MaxPlayersForm,
  WaitlistToggle,
  VoteGateToggle,
  AvailabilityLockToggle,
} from "./availability-admin";
import { AddGuestForm, GuestList, AdminAddGuestForm } from "./guest-controls";
import { listGuests, MAX_GUESTS_PER_HOST } from "@/lib/guests";
import { MatchNav } from "../match-nav";
import { SquadGrid, PeopleChips } from "./who-is-playing";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Availability · Sideline",
};

// Availability is read live on every request.
export const dynamic = "force-dynamic";

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

  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  const myPlayerId = session.user.playerId;

  // One round-trip wave: everything below only depends on the match id.
  const [
    match,
    players,
    availabilityLockEnabled,
    guests,
    subscriberIds,
    waitlistEnabled,
    waitlistVisible,
    voteGateEnabled,
    lastNudgeAt,
  ] = await Promise.all([
    getAvailabilityMatch(matchId),
    getAvailabilityAllPlayers(matchId),
    isAvailabilityLockEnabled(),
    listGuests(matchId),
    getSubscriberIdsForMatch(matchId),
    isAdmin ? isWaitlistAutoPromoteEnabled() : Promise.resolve(false),
    isWaitlistVisibleToPlayers(),
    isAdmin ? isVoteGateEnabled() : Promise.resolve(false),
    isAdmin ? getLastNudgeAt(matchId) : Promise.resolve(null),
  ]);
  if (!match) notFound();
  // Admins always see the waitlist; players only when it is made visible.
  const waitlistPlayers = isAdmin || waitlistVisible ? await getWaitlistPlayers(matchId) : [];
  const open = match.availabilityOpen;

  // 24h availability lock (admin-toggled). Players can't change within 24h of
  // kickoff; admins always can.
  const availabilityLocked =
    availabilityLockEnabled && isWithinAvailabilityLock(match.kickoffAt);
  const msToLock = availabilityLockEnabled ? msUntilLock(match.kickoffAt) : null;

  const inPlayers = players.filter((p) => p.status === "in");
  const outPlayers = players.filter((p) => p.status === "out");
  const pendingPlayers = players.filter((p) => p.status === "pending");
  const mine = myPlayerId == null ? null : players.find((p) => p.playerId === myPlayerId);

  const approvedGuests = guests.filter((g) => g.status === "approved");
  const pendingGuests = guests.filter((g) => g.status === "pending");
  const myGuests = myPlayerId == null ? [] : guests.filter((g) => g.hostPlayerId === myPlayerId);
  // Same definition the server uses for the cap: players IN + approved guests.
  const squadCount = inPlayers.length + approvedGuests.length;

  const iAmSubscriber = myPlayerId != null && subscriberIds.has(Number(myPlayerId));
  const seasonMatch = subscriberIds.size > 0;

  // Players an admin can still add to the waitlist: not already IN and not queued.
  const waitlistedIds = new Set(waitlistPlayers.map((w) => w.playerId));
  const waitlistCandidates = players
    .filter((p) => p.status !== "in" && !waitlistedIds.has(p.playerId))
    .map((p) => ({ playerId: p.playerId, name: p.name }));

  const photoById = new Map(players.map((p) => [p.playerId, p.photoUrl]));
  const statusById = new Map(players.map((p) => [p.playerId, p.status]));
  const shownWaitlist = waitlistPlayers.map((w) => ({
    ...w,
    photoUrl: photoById.get(w.playerId) ?? null,
    status: statusById.get(w.playerId),
  }));
  const full = squadCount >= match.maxPlayers;
  const adminMatchId = isAdmin ? matchId : null;
  // eslint-disable-next-line react-hooks/purity -- request-time snapshot in a server component
  const nowMs = Date.now();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← Match
      </Link>

      <MatchNav matchId={matchId} isAdmin={isAdmin} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SectionIcon name="availability" className="h-8 w-8" />
        <h1 className="text-xl font-bold tracking-tight">Availability</h1>
        <span className="text-sm text-neutral-500">{matchLabelWithTime(match.playedOn, match.matchTime)}</span>
        {seasonMatch ? (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            season
          </span>
        ) : null}
      </div>

      {isAdmin && match.matchdayStatus !== "closed" ? (
        <AdminActionBar
          matchId={matchId}
          open={open}
          pendingCount={pendingPlayers.length}
          pendingGuestCount={pendingGuests.length}
          squadReady={full || (!open && squadCount >= 10)}
          lastNudgeAt={lastNudgeAt}
          nudgeCooldownMs={NUDGE_COOLDOWN_MS}
          nowMs={nowMs}
        />
      ) : null}

      {myPlayerId != null ? (
        <section className="mt-4">
          <AvailabilityControls
            matchId={matchId}
            currentStatus={mine?.status ?? "pending"}
            open={open}
            locked={availabilityLocked}
            msToLock={msToLock}
            isSubscriber={iAmSubscriber}
          />
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-neutral-500 dark:border-white/10">
          Admin accounts can view responses but cannot set availability.
        </p>
      )}

      {isAdmin && pendingGuests.length > 0 ? (
        <section
          id="guest-requests"
          className="mt-6 scroll-mt-24 rounded-2xl border border-amber-500/30 bg-amber-50/60 p-4 dark:bg-amber-950/20"
        >
          <h2 className="text-sm font-semibold">
            Guest requests <span className="font-normal text-neutral-500">({pendingGuests.length})</span>
          </h2>
          <div className="mt-3">
            <GuestList matchId={matchId} guests={pendingGuests} showHost canRemove={false} canApprove />
          </div>
        </section>
      ) : null}

      <SquadGrid
        players={inPlayers}
        guests={approvedGuests}
        subscriberIds={subscriberIds}
        myPlayerId={myPlayerId ?? null}
        adminMatchId={adminMatchId}
        maxPlayers={match.maxPlayers}
        adminHint={isAdmin}
      />

      <div className="mt-3 space-y-2">
        <PeopleChips
          label="Waitlist"
          dotClass="bg-sky-500"
          people={shownWaitlist}
          numbered
          highlightId={myPlayerId ?? null}
          adminMatchId={adminMatchId}
          defaultOpen={myPlayerId != null && shownWaitlist.some((w) => w.playerId === myPlayerId)}
        />
        <PeopleChips
          label="No reply yet"
          dotClass="bg-amber-500"
          people={pendingPlayers}
          highlightId={myPlayerId ?? null}
          adminMatchId={adminMatchId}
          defaultOpen={isAdmin}
        />
        <PeopleChips
          label="Out"
          dotClass="bg-red-500"
          people={outPlayers}
          highlightId={myPlayerId ?? null}
          adminMatchId={adminMatchId}
        />
      </div>

      {myPlayerId != null ? (
        <details className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-semibold">
            Bring a guest{myGuests.length > 0 ? ` (${myGuests.length})` : ""}
          </summary>
          <p className="mt-2 text-xs text-neutral-500">
            Request up to {MAX_GUESTS_PER_HOST} guests. An admin approves them before they join the draft.
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
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Admin · this match</h2>
          <div className="mt-2 space-y-2">
            <details className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <summary className="cursor-pointer text-sm font-semibold">Sign-up &amp; squad size</summary>
              <div className="mt-3 space-y-4">
                <AvailabilityOpenToggle matchId={matchId} open={open} />
                <div className="border-t border-black/5 pt-4 dark:border-white/5">
                  <MaxPlayersForm matchId={matchId} maxPlayers={match.maxPlayers} />
                </div>
              </div>
            </details>
            <details className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <summary className="cursor-pointer text-sm font-semibold">
                Guests{approvedGuests.length > 0 ? ` (${approvedGuests.length})` : ""}
              </summary>
              <div className="mt-3">
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
            <details className="rounded-xl border border-amber-500/30 bg-amber-50/40 p-4 dark:bg-amber-950/10">
              <summary className="cursor-pointer text-sm font-semibold">
                Waitlist &amp; club-wide settings
              </summary>
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                The switches below apply to every match, not just this one.
              </p>
              <div className="mt-3 space-y-4">
                <WaitlistToggle
                  matchId={matchId}
                  enabled={waitlistEnabled}
                  visibleToPlayers={waitlistVisible}
                  waitlist={waitlistPlayers}
                  candidates={waitlistCandidates}
                />
                <div className="border-t border-amber-500/20 pt-4">
                  <h4 className="mb-2 text-sm font-medium">Vote-gate</h4>
                  <VoteGateToggle matchId={matchId} enabled={voteGateEnabled} />
                </div>
                <div className="border-t border-amber-500/20 pt-4">
                  <h4 className="mb-2 text-sm font-medium">Lock 24h before kickoff</h4>
                  <AvailabilityLockToggle matchId={matchId} enabled={availabilityLockEnabled} />
                </div>
              </div>
            </details>
          </div>
        </section>
      ) : null}
    </main>
  );
}
