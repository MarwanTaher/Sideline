import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { listMatchDues, listOpenDues, listPaymentMatches } from "@/lib/dues";
import {
  bucketDues,
  clubToday,
  formatOwed,
  type Due,
  type DueSource,
} from "@/lib/dues-summary";
import { getActiveSubscriptionSeason } from "@/lib/season-subscriptions";
import { matchLabel } from "@/lib/format";
import { MatchPaymentsAdmin } from "@/app/matches/[id]/payments/admin-sections";
import { InboxSection } from "./inbox";
import { BillingSection } from "./billing-section";

export const metadata = {
  title: "Payments · Sideline",
};

export const dynamic = "force-dynamic";

const TABS = [
  { key: "inbox", label: "Inbox" },
  { key: "matches", label: "Matches" },
  { key: "billing", label: "Season billing & fund" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const FILTERS: Array<{ key: string; label: string; sources: DueSource[] | null }> = [
  { key: "all", label: "All", sources: null },
  { key: "season", label: "Season bills", sources: ["season_invoice"] },
  { key: "charges", label: "Session charges", sources: ["session_fee", "replacement"] },
  { key: "match", label: "Match pot", sources: ["match_share"] },
];

/**
 * The admin's one Payments page. Inbox: every unconfirmed due from the
 * ledger (To confirm / Overdue / Open, bulk confirm). Matches: one match's
 * session charges, facility payment and pot. Season billing & fund: rates,
 * transfer details, invoices, MultiSport, leftover credit and the fund.
 * Admin ▸ Billing and a match's Payments tab lead here.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; source?: string; match?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (!(await isAdminView(role === "admin" || role === "super"))) redirect("/payments");

  // Season billing was on Admin ▸ Accounts, which is super-admin only; keep that.
  const canBill = role === "super";
  const tabs = TABS.filter((t) => t.key !== "billing" || canBill);
  const params = await searchParams;
  const tab: TabKey = tabs.some((t) => t.key === params.tab) ? (params.tab as TabKey) : "inbox";

  return (
    <main className={`mx-auto w-full flex-1 px-4 py-6 ${tab === "billing" ? "max-w-3xl xl:max-w-none" : "max-w-3xl"}`}>
      <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
      <nav aria-label="Payments sections" className="mt-3 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "inbox" ? "/admin/payments" : `/admin/payments?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              t.key === tab
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-300"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "inbox" ? <Inbox source={params.source} /> : null}
      {tab === "matches" ? <Matches matchParam={params.match} /> : null}
      {tab === "billing" ? <Billing periodParam={params.period} /> : null}
    </main>
  );
}

async function Inbox({ source }: { source?: string }) {
  const filter = FILTERS.find((f) => f.key === source) ?? FILTERS[0];
  const today = clubToday();
  const all = await listOpenDues();
  const dues: Due[] = filter.sources ? all.filter((d) => filter.sources!.includes(d.source)) : all;
  const b = bucketDues(dues, today);
  const overdueKeys = new Set(b.overdue.map((d) => d.key));
  const open = b.toPay.filter((d) => !overdueKeys.has(d.key));

  return (
    <>
      <p className="mt-3 text-sm text-neutral-500 tabular-nums">
        To confirm {b.waiting.length} · Overdue {b.overdue.length} · Open {open.length} · Outstanding{" "}
        {formatOwed(b.owedByCurrency) || "nothing"}
      </p>

      <nav aria-label="Filter by source" className="mt-3 flex flex-wrap gap-2">
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
    </>
  );
}

async function Matches({ matchParam }: { matchParam?: string }) {
  const matches = await listPaymentMatches(20);
  const selected =
    matchParam && /^\d+$/.test(matchParam) ? Number(matchParam) : (matches[0]?.id ?? null);
  const matchDues = selected != null ? await listMatchDues(selected) : [];
  const b = bucketDues(matchDues, clubToday());
  const current = matches.find((m) => m.id === selected);

  return (
    <>
      <nav aria-label="Pick a match" className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {matches.map((m) => (
          <Link
            key={m.id}
            href={`/admin/payments?tab=matches&match=${m.id}`}
            aria-current={m.id === selected ? "page" : undefined}
            className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs ${
              m.id === selected
                ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                : "border-black/10 text-neutral-600 dark:border-white/15 dark:text-neutral-300"
            }`}
          >
            {matchLabel(m.playedOn)}
            {m.declared > 0 ? <span className="ml-1 text-sky-700 dark:text-sky-300">· {m.declared} to confirm</span> : null}
            {m.open > 0 ? <span className="ml-1 text-amber-700 dark:text-amber-300">· {m.open} open</span> : null}
          </Link>
        ))}
      </nav>

      {selected == null ? (
        <p className="mt-4 text-sm text-neutral-500">No matches yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {current ? matchLabel(current.playedOn) : `Match ${selected}`}
              <span className="ml-2 text-sm font-normal text-neutral-500">
                {current?.inSeason ? "season match" : "normal match"}
              </span>
            </h2>
            <Link href={`/matches/${selected}`} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-300">
              Open match
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-500 tabular-nums">
            {b.toPay.length} open ({formatOwed(b.owedByCurrency) || "nothing"}) · {b.waiting.length} to confirm ·{" "}
            {b.history.length} paid
          </p>
          {b.waiting.length > 0 ? (
            <InboxSection title="To confirm" dues={b.waiting} bulkLabel="Confirm all" mode="confirm" empty="" />
          ) : null}
          <MatchPaymentsAdmin matchId={selected} />
        </>
      )}
    </>
  );
}

async function Billing({ periodParam }: { periodParam?: string }) {
  const season = await getActiveSubscriptionSeason();
  if (!season) {
    return (
      <p className="mt-4 rounded-xl bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:bg-neutral-900">
        Season billing appears once a subscription season is set up on Admin ▸ Seasons.
      </p>
    );
  }
  return <BillingSection season={season} periodParam={periodParam} />;
}
