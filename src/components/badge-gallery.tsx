import Image from "next/image";
import { AWARD_TYPES, AWARD_LABELS, type AwardType } from "@/lib/awards";

const BADGE_IMAGE_BY_AWARD: Record<AwardType, string> = {
  top_scorer: "TS.png",
  top_goal_contribution: "TGC.png",
  top_defender: "TD.png",
  top_performer: "MOTM2.png",
  motm: "MOTM.png",
};

/**
 * Badge collection grid (mirrors Streamlit _render_profile_badge_collection).
 * When `counts` is null the badges render locked with a sign-in hint.
 */
export default function BadgeGallery({
  counts,
}: {
  counts: Record<AwardType, number> | null;
}) {
  return (
    <div>
      {counts ? (
        <p className="text-sm text-neutral-500">
          Total awards earned:{" "}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">
            {Object.values(counts).reduce((a, b) => a + b, 0)}
          </span>
        </p>
      ) : (
        <p className="text-sm text-neutral-500">
          Sign in as a player to see your earned counts.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {AWARD_TYPES.map((awardType) => {
          const count = counts?.[awardType] ?? 0;
          const earned = count > 0;
          return (
            <div
              key={awardType}
              className={`flex flex-col items-center rounded-xl border p-4 text-center transition ${
                earned
                  ? "border-black/10 dark:border-white/10"
                  : "border-dashed border-black/10 opacity-60 dark:border-white/10"
              }`}
            >
              <Image
                src={`/badges/${BADGE_IMAGE_BY_AWARD[awardType]}`}
                alt={AWARD_LABELS[awardType]}
                width={72}
                height={72}
                className={earned ? "" : "grayscale"}
              />
              <span className="mt-2 text-sm font-medium">
                {AWARD_LABELS[awardType]}
              </span>
              {counts ? (
                earned ? (
                  <span className="mt-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    Earned ×{count}
                  </span>
                ) : (
                  <span className="mt-1 text-xs text-neutral-400">Locked</span>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
