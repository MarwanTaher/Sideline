import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import {
  getActiveSubscriptionSeason,
  getSeasonWaitlistPosition,
  listSubscribers,
  getSubscription,
} from "@/lib/season-subscriptions";
import { Avatar } from "@/components/ui/avatar";
import { SectionIcon } from "@/components/section-icon";
import { listPlayerInvoices, getPaymentDetails } from "@/lib/season-billing";
import { listPlayerScans, uncreditedTotalMinor } from "@/lib/multisport";
import { getFundBalance } from "@/lib/season-fund";
import { formatMinor } from "@/lib/format-money";
import { SubNav } from "@/components/ui/sub-nav";
import { sqlClient } from "@/lib/db";
import {
  AcceptTerms,
  SeasonWaitlistButton,
  WithdrawButton,
} from "./subscription-controls";
import { MultisportReporter } from "./billing-panels";
import PaymentsTab from "./payments-tab";
import SeasonTabsMobile from "./season-tabs-mobile";

export const metadata = {
  title: "Season subscription · Sideline",
};

export const dynamic = "force-dynamic";

export default async function SeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { tab } = await searchParams;

  const season = await getActiveSubscriptionSeason();
  if (!season) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Season subscription</h1>
        <p className="mt-3 rounded-xl bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:bg-neutral-900">
          There is no season subscription running at the moment.
        </p>
      </main>
    );
  }

  // An unreleased season is admin-only, so it can be set up and tested without
  // players seeing a half-finished page or committing to draft terms.
  const isAdmin = await isAdminView(
    session.user.role === "admin" || session.user.role === "super",
  );
  if (!season.visibleToPlayers && !isAdmin) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Season subscription</h1>
        <p className="mt-3 rounded-xl bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:bg-neutral-900">
          There is no season subscription running at the moment.
        </p>
      </main>
    );
  }

  const playerId = session.user.playerId;
  const pid = playerId == null ? null : Number(playerId);
  const activeTab =
    tab === "payments" || tab === "multisport" || tab === "fund" ? tab : "overview";

  const mine = pid == null ? null : await getSubscription(season.id, pid);
  const isSubscriber = mine?.status === "active";
  const forMe = isSubscriber && pid != null;

  // Each tab fetches only what it renders. Loading every tab's data on every
  // tab made switching feel like a page load.
  const [
    subscribers,
    invoices,
    paymentDetails,
    uncredited,
    scans,
    playedRows,
    fund,
    waitlistPosition,
  ] =
    await Promise.all([
      activeTab === "overview" ? listSubscribers(season.id) : Promise.resolve([]),
      activeTab === "payments" && forMe
        ? listPlayerInvoices(season.id, pid)
        : Promise.resolve([]),
      activeTab === "payments"
        ? getPaymentDetails(season.id)
        : Promise.resolve({
            paymentName: "",
            paymentAccount: "",
            paymentMethod: "",
            paymentNote: "",
            payLink: "",
          }),
      activeTab === "payments" && forMe
        ? uncreditedTotalMinor(pid)
        : Promise.resolve(0),
      activeTab === "multisport" && forMe ? listPlayerScans(pid) : Promise.resolve([]),
      activeTab === "multisport" && forMe
        ? (sqlClient.query(
            `SELECT m.id, m.played_on
               FROM matches m
               JOIN match_availability ma
                 ON ma.match_id = m.id AND ma.player_id = $1 AND ma.status = 'in'
              WHERE m.season_id = $2
                AND (m.kickoff_at IS NULL OR m.kickoff_at <= NOW())
              ORDER BY m.played_on DESC
              LIMIT 12`,
            [pid, season.id],
          ) as unknown as Promise<Array<{ id: number; played_on: string }>>)
        : Promise.resolve([]),
      activeTab === "fund"
        ? getFundBalance(season.id)
        : Promise.resolve({
            roundingMinor: 0,
            guestFeesMinor: 0,
            guestFeesOutstandingMinor: 0,
            extensionCostMinor: 0,
            adjustmentsMinor: 0,
            balanceMinor: 0,
          }),
      activeTab === "overview" && pid != null
        ? getSeasonWaitlistPosition(season.id, pid)
        : Promise.resolve(null),
    ]);

  const spotsLeft = Math.max(0, season.subscriberCap - subscribers.length);

  const playedMatches = playedRows.map((m) => ({
    id: Number(m.id),
    playedOn: String(m.played_on),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="matches" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">{season.name}</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {season.startDate} → {season.endDate ?? "ongoing"}
      </p>

      {!season.visibleToPlayers ? (
        <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Draft — hidden from players.</strong> Only admins can see this
          season. Release it from Admin control when it&apos;s ready.
        </p>
      ) : null}

      <SubNav
        className="mt-4 hidden md:block"
        ariaLabel="Season sections"
        items={[
          { href: "/season", label: "Overview" },
          { href: "/season?tab=payments", label: "Payments" },
          { href: "/season?tab=multisport", label: "MultiSport" },
          { href: "/season?tab=fund", label: "Group fund" },
        ]}
      />
      <Suspense fallback={null}>
        <SeasonTabsMobile />
      </Suspense>

      {tab === "payments" ? (
        isSubscriber && pid != null ? (
          <div className="mt-5">
            <PaymentsTab
              invoices={invoices}
              details={paymentDetails}
              playerName={session.user.name ?? "Player"}
              uncreditedMinor={uncredited}
            />
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:bg-neutral-900">
            Subscription bills apply to the core group only.
          </p>
        )
      ) : tab === "multisport" ? (
        <section className="mt-5 rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            MultiSport
          </h2>
          <div className="mt-3">
            {isSubscriber ? (
              <MultisportReporter
                seasonId={season.id}
                matches={playedMatches}
                scans={scans}
              />
            ) : (
              <p className="text-sm text-neutral-500">
                MultiSport credits apply to the core group only.
              </p>
            )}
          </div>
        </section>
      ) : tab === "fund" ? (
        <section className="mt-5 rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Group fund
          </h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">
            {formatMinor(fund.balanceMinor)}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Built from extra players&apos; session fees and the rounding on monthly
            bills, less what the 2-hour extensions cost. It covers an unfilled core
            place or a session the group still has to pay for.
          </p>
          <ul className="mt-4 divide-y divide-black/5 text-sm dark:divide-white/10">
            <FundLine label="Extra players' fees" value={fund.guestFeesMinor} />
            <FundLine label="Rounding on paid bills" value={fund.roundingMinor} />
            <FundLine label="2-hour extensions" value={-fund.extensionCostMinor} />
            <FundLine label="Adjustments" value={fund.adjustmentsMinor} />
          </ul>
        </section>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Core places" value={`${subscribers.length} / ${season.subscriberCap}`} />
            <Stat label="Still free" value={spotsLeft === 0 ? "Full" : String(spotsLeft)} />
            <Stat label="Your place" value={isSubscriber ? "Confirmed" : "Not taken"} />
          </div>

          {isSubscriber ? (
            <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              You hold a core place. You&apos;ll be marked <strong>IN</strong> for every
              match of the season automatically — you only need to act if you
              <em> can&apos;t</em> make one.
            </p>
          ) : null}

          {season.terms ? (
            <section className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/10">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Rules and organisation
              </h2>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                {season.terms}
              </div>
            </section>
          ) : null}

          <section className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {isSubscriber ? "Your subscription" : "Take a place"}
            </h2>
            <div className="mt-3">
              {playerId == null ? (
                <p className="text-sm text-neutral-500">
                  Only player accounts can hold a season place.
                </p>
              ) : isSubscriber ? (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-500">
                    Accepted on {new Date(mine!.acceptedAt).toLocaleDateString()} (terms
                    v{mine!.acceptedTermsVersion}).
                  </p>
                  <WithdrawButton seasonId={season.id} />
                </div>
              ) : (
                <>
                  <AcceptTerms
                    seasonId={season.id}
                    spotsLeft={spotsLeft}
                    signupOpen={season.signupOpen}
                  />
                  {spotsLeft <= 0 || !season.signupOpen ? (
                    <SeasonWaitlistButton
                      seasonId={season.id}
                      position={waitlistPosition}
                    />
                  ) : null}
                </>
              )}
            </div>
          </section>

      <section className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Core group ({subscribers.length})
        </h2>
        {subscribers.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nobody has committed yet.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {subscribers.map((s, i) => (
              <li key={s.playerId} className="flex items-center gap-2.5 text-sm">
                <span className="w-5 shrink-0 text-right tabular-nums text-neutral-400">
                  {i + 1}
                </span>
                <Link
                  href={`/players/${s.playerId}`}
                  className="flex min-w-0 items-center gap-2 transition hover:opacity-80"
                >
                  <Avatar name={s.name} photoUrl={s.photoUrl} size="xs" />
                  <span className="truncate font-medium">{s.name}</span>
                </Link>
                {Number(playerId) === s.playerId ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">you</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
        </>
      )}
    </main>
  );
}

function FundLine({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
      <span
        className={`tabular-nums ${
          value < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {value < 0 ? "−" : "+"}
        {formatMinor(Math.abs(value))}
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-3 text-center dark:border-white/10">
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );
}
