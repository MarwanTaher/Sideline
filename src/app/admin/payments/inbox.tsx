"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import {
  dueTitle,
  duePayeeLabel,
  formatDueAmount,
  type Due,
} from "@/lib/dues-summary";
import {
  markDuesPaidAction,
  rejectDeclarationAction,
  remindDueAction,
  type InboxActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";

const INITIAL: InboxActionState = { ok: false, message: "" };

function useRefresh(state: InboxActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

export function InboxSection({
  title,
  dues,
  bulkLabel,
  mode,
  empty,
}: {
  title: string;
  dues: Due[];
  /** Shows a bulk button that marks every listed due paid. */
  bulkLabel?: string;
  mode: "confirm" | "overdue" | "open";
  empty: string;
}) {
  const [bulkState, bulkAction, bulkPending] = useActionState(markDuesPaidAction, INITIAL);
  useRefresh(bulkState);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {title} ({dues.length})
        </h2>
        {bulkLabel && dues.length > 1 ? (
          <form action={bulkAction}>
            {dues.map((d) => (
              <input key={d.key} type="hidden" name="key" value={d.key} />
            ))}
            <Button type="submit" size="sm" pending={bulkPending} pendingLabel="…">
              {bulkLabel}
            </Button>
          </form>
        ) : null}
      </div>
      <FeedbackMessage ok={bulkState.ok} message={bulkState.message} className="mt-1" />
      <div className="mt-2 rounded-2xl border border-black/[0.06] bg-white px-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        {dues.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">{empty}</p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {dues.map((d) => (
              <InboxRow key={d.key} due={d} mode={mode} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InboxRow({ due, mode }: { due: Due; mode: "confirm" | "overdue" | "open" }) {
  const [paidState, paidAction, paidPending] = useActionState(markDuesPaidAction, INITIAL);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectDeclarationAction, INITIAL);
  const [remindState, remindAction, remindPending] = useActionState(remindDueAction, INITIAL);
  useRefresh(paidState);
  useRefresh(rejectState);

  const href =
    due.source === "season_invoice"
      ? "/admin/accounts?tab=billing" + (due.period ? `&period=${due.period}` : "")
      : due.matchId != null
        ? `/matches/${due.matchId}/payments`
        : null;
  const when =
    mode === "confirm" && due.declaredAt
      ? `sent ${fmtDate(due.declaredAt.slice(0, 10))}`
      : `${mode === "overdue" ? "overdue since" : "due"} ${fmtDate(due.dueOn)}`;
  const isInvoice = due.source === "season_invoice";

  const buttons: ReactNode[] = [
    <form key="paid" action={paidAction}>
      <input type="hidden" name="key" value={due.key} />
      <Button type="submit" size="sm" variant="success" pending={paidPending} pendingLabel="…">
        {mode === "confirm" ? "Confirm" : "Mark paid"}
      </Button>
    </form>,
  ];
  if (mode === "confirm" && isInvoice) {
    buttons.push(
      <form key="reject" action={rejectAction}>
        <input type="hidden" name="key" value={due.key} />
        <Button type="submit" size="sm" variant="ghost" pending={rejectPending} pendingLabel="…">
          Reject
        </Button>
      </form>,
    );
  }
  if (mode === "overdue" && isInvoice) {
    buttons.push(
      <form key="remind" action={remindAction}>
        <input type="hidden" name="key" value={due.key} />
        <Button type="submit" size="sm" variant="secondary" pending={remindPending} pendingLabel="…">
          Remind
        </Button>
      </form>,
    );
  }

  const feedback = [paidState, rejectState, remindState].find((s) => s.message);

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {due.payerName}
            <span className="ml-2 font-normal text-neutral-500">
              {href ? (
                <Link href={href} className="underline-offset-2 hover:underline">
                  {dueTitle(due)}
                </Link>
              ) : (
                dueTitle(due)
              )}
            </span>
          </p>
          <p className={`text-xs ${mode === "overdue" ? "text-red-600 dark:text-red-400" : "text-neutral-500"}`}>
            {duePayeeLabel(due)} · {when}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tabular-nums">{formatDueAmount(due)}</span>
          {buttons}
        </div>
      </div>
      {feedback ? <FeedbackMessage ok={feedback.ok} message={feedback.message} className="mt-1" /> : null}
    </li>
  );
}
