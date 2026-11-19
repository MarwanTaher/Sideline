import type { PlayerCharge } from "@/lib/season-fund";
import type { SeasonPaymentDetails } from "@/lib/season-billing";
import { formatMinor } from "@/lib/format-money";

/**
 * The signed-in player's own session charges for one match (theirs and their
 * guests'). Read-only: the admin marks them paid when the money arrives.
 */
export function PlayerCharges({
  charges,
  details,
}: {
  charges: PlayerCharge[];
  details: SeasonPaymentDetails | null;
}) {
  if (charges.length === 0) return null;
  const hasGroupCharge = charges.some((c) => (c.kind === "extra" || c.newRules) && !c.paidAt);
  const groupPayee = [details?.paymentName, details?.paymentAccount]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold">Your session charges</h2>
      <p className="mt-1 text-xs text-neutral-500">
        You are not on a core seat for this match, so a session fee applies.
        The admin marks it paid once the money arrives.
      </p>
      <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10">
        {charges.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {c.name}
                {c.guestId != null ? (
                  <span className="ml-2 text-xs text-neutral-400">your guest</span>
                ) : null}
              </p>
              <p className="text-xs text-neutral-500">
                {c.kind === "replacement"
                  ? c.newRules
                    ? `Replacement for ${c.owedToName ?? "a subscriber"} · pay the group`
                    : `Replacement · pay ${c.owedToName ?? "the subscriber"} directly`
                  : "Session fee · pay the group"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{formatMinor(c.amountMinor)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.paidAt
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
              >
                {c.paidAt ? "✓ Paid" : "Unpaid"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {hasGroupCharge ? (
        <p className="mt-2 text-xs text-neutral-500">
          {groupPayee
            ? `Group payments go to ${groupPayee}.`
            : "Ask an admin for the group's payment details."}
          {details?.paymentNote?.trim() ? ` ${details.paymentNote.trim()}` : ""}
        </p>
      ) : null}
    </section>
  );
}
