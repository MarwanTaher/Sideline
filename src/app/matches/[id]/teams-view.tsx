"use client";

import Link from "next/link";
import type { MatchTeam } from "@/lib/matches";
import { FieldView, type FieldBalance, type FieldLive } from "./field-view";
import type { FieldFeatures } from "@/lib/field-view";
import { teamGridColumns } from "@/lib/team-constants";
import { useLocalStorage, writeLocal } from "@/lib/local-store";

/* Overview teams block with a segmented toggle between a compact roster list
 * and the static field view. */

type Mode = "list" | "field";

const STORAGE_KEY = "sideline:teams-view";

export function TeamsView({
  teams,
  matchId,
  myPlayerId,
  features,
  live,
  balance,
}: {
  teams: MatchTeam[];
  matchId: number;
  myPlayerId: number | null;
  features: FieldFeatures;
  live: FieldLive | null;
  balance: FieldBalance | null;
}) {
  // The last-used view persists across matches (field until the device says otherwise).
  const saved = useLocalStorage(STORAGE_KEY);
  const mode: Mode = saved === "list" ? "list" : "field";

  function selectMode(next: Mode) {
    writeLocal(STORAGE_KEY, next);
  }

  return (
    <div className="mt-3">
      <div className="mb-4 inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
        <TabButton active={mode === "list"} onClick={() => selectMode("list")}>
          List
        </TabButton>
        <TabButton active={mode === "field"} onClick={() => selectMode("field")}>
          Field
        </TabButton>
      </div>

      {mode === "list" ? <TeamList teams={teams} /> : <FieldView
          teams={teams}
          matchId={matchId}
          myPlayerId={myPlayerId}
          features={features}
          live={live}
          balance={balance}
        />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition active:scale-[0.97] ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function TeamList({ teams }: { teams: MatchTeam[] }) {
  return (
    <div className={`grid gap-4 ${teamGridColumns(teams.length)}`}>
      {teams.map((team) => (
        <div
          key={team.teamNo}
          className="rounded-2xl border border-black/[0.06] p-4 shadow-sm dark:border-white/10"
        >
          <h3 className="text-sm font-semibold">
            {team.name?.trim() || `Team ${team.teamNo}`}{" "}
            <span className="font-normal text-neutral-400">({team.players.length})</span>
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {team.players.map((p) => (
              <li key={p.playerId} className="flex items-center justify-between">
                <span>
                  {p.isGuest ? (
                    <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      Guest
                    </span>
                  ) : null}
                  {p.isGuest ? (
                    <span>{p.name}</span>
                  ) : (
                    <Link
                      href={`/players/${p.playerId}`}
                      className="transition hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                      {p.name}
                    </Link>
                  )}
                  {p.isGuest && p.hostName ? (
                    <span className="text-xs text-neutral-500"> · of {p.hostName}</span>
                  ) : null}
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {p.position}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
