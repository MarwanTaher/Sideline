import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { listOpenDues } from "@/lib/dues";
import { bucketDues, clubToday, formatOwed, type Due, type DueSource } from "@/lib/dues-summary";
import { InboxSection } from "./inbox";

export const metadata = {
  title: "Payments inbox · Sideline",
};

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string; sources: DueSource[] | null }> = [
  { key: "all", label: "All", sources: null },
  { key: "season", label: "Season bills", sources: ["season_invoice"] },
  { key: "charges", label: "Session charges", sources: ["session_fee", "replacement"] },
  { key: "match", label: "Match pot", sources: ["match_share"] },
];

/**
 * Admin Payments inbox (review §5.4, P1.3): every unconfirmed due across the
 * three payment systems, split into To confirm / Overdue / Open, with bulk
 * confirm. Admin ▸ Billing keeps rates, invoice generation, MultiSport and
 * the fund; Match ▸ Payments stays the per-match drill-down.
 */
export default async function PaymentsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (!(await isAdminView(role === "admin" || role === "super"))) redirect("/");

  const { source } = await searchParams;
  const filter = FILTERS.find((f) => f.key === source) ?? FILTERS[0];

  const today = clubToday();
  const all = await listOpenDues();
  const dues: Due[] = filter.sources ? all.filter((d) => filter.sources!.includes(d.source)) : all;
  const b = bucketDues(dues, today);
  const overdueKeys = new Set(b.overdue.map((d) => d.key));
  const open = b.toPay.filter((d) => !overdueKeys.has(d.key));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Payments inbox</h1>
        <p className="text-sm text-neutral-500 tabular-nums">
          To confirm {b.waiting.length} · Overdue {b.overdue.length} · Open {open.length}
        </p>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Outstanding {formatOwed(b.owedByCurrency) || "nothing"}. Rates, invoices and
        the fund stay on{" "}
        <Link href="/admin/accounts?tab=billing" className="underline underline-offset-2">
          Admin ▸ Billing
        </Link>
        .
      </p>

      <nav aria-label="Filter by source" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/payments" : `/admin/payments?source=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              f.key === filter.key
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-black/10 text-neutral-600 dark:border-white/15 dark:text-neutral-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <InboxSection
        title="To confirm"
        dues={b.waiting}
        bulkLabel="Confirm all"
        mode="confirm"
        empty="Nobody is waiting for a confirmation."
      />
      <InboxSection title="Overdue" dues={b.overdue} mode="overdue" empty="Nothing overdue." />
      <InboxSection title="Open" dues={open} mode="open" empty="Nothing else open." />
    </main>
  );
}
