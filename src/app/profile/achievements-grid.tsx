import { ACHIEVEMENTS, type EarnedAchievement } from "@/lib/achievements";

/**
 * Full achievement grid: earned badges shown in colour, locked ones dimmed with
 * a progress hint so players see what's within reach — a badge nobody can earn
 * is just wallpaper.
 */
export default function AchievementsGrid({
  earned,
  progress,
}: {
  earned: EarnedAchievement[];
  progress: { appearances: number; goals: number };
}) {
  const earnedKeys = new Set(earned.map((e) => e.key));

  function hint(key: string): string | null {
    const def = ACHIEVEMENTS.find((a) => a.key === key);
    if (!def || !def.metric || !def.target) return null;
    const have = def.metric === "appearances" ? progress.appearances : progress.goals;
    const remaining = def.target - have;
    if (remaining <= 0) return null;
    const noun = def.metric === "appearances" ? "match" : "goal";
    return `${remaining} more ${noun}${remaining === 1 ? "" : "s"}`;
  }

  return (
    <div>
      <p className="text-sm text-neutral-500">
        Unlocked{" "}
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{earned.length}</span> of{" "}
        {ACHIEVEMENTS.length}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACHIEVEMENTS.map((def) => {
          const isEarned = earnedKeys.has(def.key);
          const progressHint = isEarned ? null : hint(def.key);
          return (
            <div
              key={def.key}
              className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                isEarned
                  ? "border-black/10 dark:border-white/10"
                  : "border-dashed border-black/10 opacity-60 dark:border-white/10"
              }`}
            >
              <span className={`text-3xl ${isEarned ? "" : "grayscale"}`}>{def.emoji}</span>
              <span className="mt-1.5 text-sm font-medium">{def.label}</span>
              <span className="mt-0.5 text-xs text-neutral-400">{def.description}</span>
              {isEarned ? (
                <span className="mt-1.5 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Unlocked
                </span>
              ) : progressHint ? (
                <span className="mt-1.5 rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800">
                  {progressHint}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
