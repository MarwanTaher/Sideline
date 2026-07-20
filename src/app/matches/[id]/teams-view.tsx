"use client";

import { useEffect, useState } from "react";
import type { MatchTeam } from "@/lib/matches";
import { StaticLineup } from "./static-lineup";

/* Overview teams block with a segmented toggle between a compact roster list
 * and the static field view. */

type Mode = "list" | "field";

const STORAGE_KEY = "sideline:teams-view";

export function TeamsView({ teams }: { teams: MatchTeam[] }) {
  const [mode, setMode] = useState<Mode>("field");

  // Restore the last-used view, then persist changes across matches.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "list" || saved === "field") setMode(saved);
  }, []);

  function selectMode(next: Mode) {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
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

      {mode === "list" ? <TeamList teams={teams} /> : <StaticLineup teams={teams} />}
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
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
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
    <div className="grid gap-4 sm:grid-cols-2">
      {teams.map((team) => (
        <div
          key={team.teamNo}
          className="rounded-xl border border-black/10 p-4 dark:border-white/10"
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
                  <span>{p.name}</span>
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
