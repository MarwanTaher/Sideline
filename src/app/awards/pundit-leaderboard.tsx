import { getPunditStandings } from "@/lib/predictions";
import { PunditTabs } from "./pundit-tabs";

/** Pundit leaderboard from the predictions mini-game (season + all-time). */
export default async function PunditLeaderboard({ playerId }: { playerId: number | null }) {
  const standings = await getPunditStandings();
  if (!standings) return null;
  return (
    <section className="mt-10" aria-labelledby="pundit-title">
      <h2 id="pundit-title" className="text-lg font-semibold tracking-tight">
        🔮 Pundit
      </h2>
      <p className="mt-1 text-sm text-neutral-500">1 point per correct matchday winner pick.</p>
      <PunditTabs
        season={standings.season}
        allTime={standings.allTime}
        myPlayerId={playerId}
      />
    </section>
  );
}

export function PunditSkeleton() {
  return (
    <div className="mt-10 animate-pulse" aria-hidden="true">
      <div className="h-5 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-3 h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-900" />
    </div>
  );
}
