"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MultisportScan } from "@/lib/multisport";
import { matchLabel } from "@/lib/format";
import { reportScanAction, type BillingActionState } from "@/app/admin/accounts/billing-actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: BillingActionState = { ok: false, message: "" };

export function MultisportReporter({
  seasonId,
  matches,
  scans,
}: {
  seasonId: number;
  matches: { id: number; playedOn: string }[];
  scans: MultisportScan[];
}) {
  const byMatch = new Map(scans.map((s) => [s.matchId, s]));

  if (matches.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Once you&apos;ve played a match you can report a MultiSport scan here.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-neutral-500">
        Report each scan made with your own card. An admin confirms it, and the
        credit comes off your next bill — as much as that bill can take; any
        rest comes off the one after. The discount is yours alone — it is never
        shared with the group. If no bill is left (you withdrew or the season
        ended), an admin refunds it or, if you agree, adds it to the group fund.
      </p>
      <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10">
        {matches.map((m) => (
          <ScanRow
            key={m.id}
            seasonId={seasonId}
            matchId={m.id}
            playedOn={m.playedOn}
            scan={byMatch.get(m.id) ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

function ScanRow({
  seasonId,
  matchId,
  playedOn,
  scan,
}: {
  seasonId: number;
  matchId: number;
  playedOn: string;
  scan: MultisportScan | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(reportScanAction, INITIAL);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const badge =
    scan?.settledAs === "refunded"
      ? { text: "refunded", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" }
      : scan?.settledAs === "fund"
        ? { text: "to group fund", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" }
        : scan?.status === "approved"
      ? { text: scan.applied ? "credited" : "approved", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" }
      : scan?.status === "rejected"
        ? { text: "rejected", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" }
        : scan
          ? { text: "waiting", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" }
          : null;

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {matchLabel(playedOn)}
          {badge ? (
            <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>
              {badge.text}
            </span>
          ) : null}
        </span>

        {scan?.applied || scan?.status === "approved" ? null : (
          <form action={formAction}>
            <input type="hidden" name="seasonId" value={seasonId} />
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="withdraw" value={scan ? "true" : "false"} />
            <Button
              type="submit"
              variant={scan ? "secondary" : "primary"}
              pending={pending}
              pendingLabel="…"
            >
              {scan ? "Withdraw" : "I scanned my card"}
            </Button>
          </form>
        )}
      </div>
      <FeedbackMessage ok={state.ok} message={state.message} className="mt-1" />
    </li>
  );
}
