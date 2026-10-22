import type { HeadToHead } from "@/lib/head-to-head";
import type { PartnerStat } from "@/lib/chemistry";
import { Card } from "@/components/ui/card";

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * "You vs <first name>" — playful pair stats for another player's profile.
 * Framed as fun, never a verdict.
 */
export default function HeadToHeadCard({
  firstName,
  viewerId,
  h2h,
  bestPartner,
  worstPartner,
}: {
  firstName: string;
  viewerId: number;
  h2h: HeadToHead;
  bestPartner: PartnerStat | null;
  worstPartner: PartnerStat | null;
}) {
  const { against, together } = h2h;
  const hasAgainst = against.faced > 0;
  const hasTogether = together.matchdays > 0;
  const nameOf = (p: PartnerStat) => (p.playerId === viewerId ? "you" : p.name);

  const bragging = !hasAgainst
    ? null
    : against.wins > against.losses
      ? "Bragging rights: you 😏"
      : against.losses > against.wins
        ? `Bragging rights: ${firstName} 👀`
        : "All square 🤝";

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          You vs {firstName}
        </h2>
        {bragging ? (
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {bragging}
          </span>
        ) : null}
      </div>

      {!hasAgainst && !hasTogether ? (
        <p className="mt-3 text-sm text-neutral-500">
          You haven&apos;t faced each other yet — next matchday?
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {hasAgainst ? (
            <li className="flex items-start gap-2">
              <span aria-hidden>⚔️</span>
              <span>
                <span className="font-semibold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{against.wins}W</span>
                  <span className="mx-1 text-neutral-300 dark:text-neutral-600">·</span>
                  <span className="text-neutral-500">{against.draws}D</span>
                  <span className="mx-1 text-neutral-300 dark:text-neutral-600">·</span>
                  <span className="text-rose-600 dark:text-rose-400">{against.losses}L</span>
                </span>{" "}
                <span className="text-neutral-500">
                  in {plural(against.faced, "mini-match", "mini-matches")} against each other
                </span>
              </span>
            </li>
          ) : null}
          {hasTogether ? (
            <li className="flex items-start gap-2">
              <span aria-hidden>🤝</span>
              <span>
                <span className="font-semibold tabular-nums">
                  {plural(together.matchdays, "matchday")} together
                </span>
                <span className="text-neutral-500">
                  {" · "}
                  {together.winRate == null ? "no results yet" : `${pct(together.winRate)} wins`}
                </span>
              </span>
            </li>
          ) : null}
        </ul>
      )}

      {bestPartner?.winRate != null || worstPartner?.winRate != null ? (
        <>
          <div className="my-4 h-px bg-black/5 dark:bg-white/10" />
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {firstName}&apos;s chemistry
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {bestPartner?.winRate != null ? (
              <li className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span aria-hidden>✨</span> Best with{" "}
                  <span className="font-medium">{nameOf(bestPartner)}</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400 tabular-nums">
                  {pct(bestPartner.winRate)} wins
                </span>
              </li>
            ) : null}
            {worstPartner?.winRate != null ? (
              <li className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span aria-hidden>🌀</span> Still clicking with{" "}
                  <span className="font-medium">{nameOf(worstPartner)}</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400 tabular-nums">
                  {pct(worstPartner.winRate)} wins
                </span>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
