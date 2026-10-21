import Link from "next/link";
import type { PlayerAvailability } from "@/lib/availability";
import type { Guest } from "@/lib/guests";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AdminPlayerTap } from "./admin-quick";

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

type Status = "in" | "out" | "pending";

/** Admins get a tap-to-set sheet; everyone else links to the profile. */
function PersonLink({
  adminMatchId,
  person,
  className,
  children,
}: {
  adminMatchId: number | null;
  person: { playerId: number; name: string; photoUrl?: string | null; status?: Status };
  className: string;
  children: ReactNode;
}) {
  if (adminMatchId != null) {
    return (
      <AdminPlayerTap
        matchId={adminMatchId}
        player={{ ...person, status: person.status ?? "pending" }}
        className={className}
      >
        {children}
      </AdminPlayerTap>
    );
  }
  return (
    <Link href={`/players/${person.playerId}`} className={className}>
      {children}
    </Link>
  );
}

/**
 * Who is actually playing, as faces rather than a list, with the position mix
 * an admin needs before drafting. ★ = season core player, G = guest.
 */
export function SquadGrid({
  players,
  guests,
  subscriberIds,
  myPlayerId,
  adminMatchId = null,
}: {
  players: PlayerAvailability[];
  guests: Guest[];
  subscriberIds: Set<number>;
  myPlayerId: number | null;
  adminMatchId?: number | null;
}) {
  const mix: Record<string, number> = {};
  for (const p of players) {
    const k = p.preferredPosition.toUpperCase();
    mix[k] = (mix[k] ?? 0) + 1;
  }
  for (const g of guests) {
    const k = g.position.toUpperCase();
    mix[k] = (mix[k] ?? 0) + 1;
  }
  const total = players.length + guests.length;
  const noKeeper = total > 0 && !mix.GK;

  return (
    <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Who&apos;s playing <span className="font-normal text-neutral-400">({total})</span>
        </h2>
        {total > 0 ? (
          <p className="flex flex-wrap gap-1.5 text-xs">
            {POSITIONS.map((pos) => (
              <span
                key={pos}
                className={`rounded px-1.5 py-0.5 font-medium tabular-nums ${
                  pos === "GK" && noKeeper
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {mix[pos] ?? 0} {pos}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {noKeeper ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
          No goalkeeper yet.
        </p>
      ) : null}

      {total === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">Nobody is in yet. Be the first.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
          {players.map((p) => {
            const core = subscriberIds.has(p.playerId);
            const me = p.playerId === myPlayerId;
            return (
              <li key={p.playerId}>
                <PersonLink
                  adminMatchId={adminMatchId}
                  person={p}
                  className="flex w-full flex-col items-center gap-1 text-center transition active:scale-95"
                >
                  <span className="relative">
                    <Avatar
                      name={p.name}
                      photoUrl={p.photoUrl}
                      size="md"
                      className={me ? "ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-neutral-900" : ""}
                    />
                    {core ? (
                      <span
                        title="Season player"
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[9px] text-white"
                      >
                        ★
                      </span>
                    ) : null}
                  </span>
                  <span className="w-full truncate text-[11px] font-medium leading-tight">
                    {me ? "You" : p.name.split(" ")[0]}
                  </span>
                  <span className="text-[10px] leading-none text-neutral-400">{p.preferredPosition}</span>
                </PersonLink>
              </li>
            );
          })}
          {guests.map((g) => (
            <li key={`g-${g.id}`} className="flex flex-col items-center gap-1 text-center" title={`Guest of ${g.hostName}`}>
              <span className="relative">
                <Avatar name={g.name} size="md" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                  G
                </span>
              </span>
              <span className="w-full truncate text-[11px] font-medium leading-tight">{g.name.split(" ")[0]}</span>
              <span className="text-[10px] leading-none text-neutral-400">{g.position}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex gap-3 text-[10px] text-neutral-400">
        <span>
          <span className="text-sky-500">★</span> season player
        </span>
        <span>
          <span className="font-bold text-indigo-500">G</span> guest
        </span>
      </p>
    </section>
  );
}

/** A collapsed group of names (waitlist, no reply, out) shown as a chip. */
export function PeopleChips({
  label,
  dotClass,
  people,
  numbered = false,
  highlightId = null,
  defaultOpen = false,
  adminMatchId = null,
}: {
  label: string;
  dotClass: string;
  people: Array<{ playerId: number; name: string; photoUrl?: string | null; status?: Status }>;
  numbered?: boolean;
  highlightId?: number | null;
  defaultOpen?: boolean;
  adminMatchId?: number | null;
}) {
  if (people.length === 0) return null;
  return (
    <details
      className="group rounded-2xl border border-black/[0.06] bg-white shadow-sm open:pb-3 dark:border-white/10 dark:bg-neutral-900"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        {label}
        <span className="rounded-full bg-neutral-100 px-1.5 text-xs tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {people.length}
        </span>
        <span aria-hidden className="ml-auto text-neutral-400 transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="flex flex-wrap gap-1.5 px-4">
        {people.map((p, i) => (
          <li key={p.playerId}>
            <PersonLink
              adminMatchId={adminMatchId}
              person={p}
              className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition hover:border-emerald-500/40 ${
                p.playerId === highlightId
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-black/10 dark:border-white/15"
              }`}
            >
              <Avatar name={p.name} photoUrl={p.photoUrl ?? null} size="xs" />
              {numbered ? <span className="tabular-nums text-neutral-400">{i + 1}.</span> : null}
              {p.playerId === highlightId ? "You" : p.name}
            </PersonLink>
          </li>
        ))}
      </ul>
    </details>
  );
}
