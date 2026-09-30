import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getActiveSubscriptionSeason,
  listSubscribers,
  getSubscription,
} from "@/lib/season-subscriptions";
import { Avatar } from "@/components/ui/avatar";
import { SectionIcon } from "@/components/section-icon";
import { AcceptTerms, WithdrawButton } from "./subscription-controls";

export const metadata = {
  title: "Season subscription · Sideline",
};

export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

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

  const playerId = session.user.playerId;
  const subscribers = await listSubscribers(season.id);
  const mine = playerId == null ? null : await getSubscription(season.id, Number(playerId));
  const isSubscriber = mine?.status === "active";
  const spotsLeft = Math.max(0, season.subscriberCap - subscribers.length);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="matches" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">{season.name}</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {season.startDate} → {season.endDate ?? "ongoing"}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
            <AcceptTerms
              seasonId={season.id}
              spotsLeft={spotsLeft}
              signupOpen={season.signupOpen}
            />
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
    </main>
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
