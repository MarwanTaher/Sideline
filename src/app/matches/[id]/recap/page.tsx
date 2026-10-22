import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { getMatchRecap } from "@/lib/recap";
import { buildDigestShareText } from "@/lib/match-digest";
import { getBaseUrl } from "@/lib/site-url";
import { ShareButton } from "@/components/share-button";
import { StoryDeck } from "./story-deck";

export const metadata = { title: "Recap · Sideline" };
export const dynamic = "force-dynamic";

function Card({ tone, emoji, kicker, children }: { tone: string; emoji: string; kicker: string; children: ReactNode }) {
  return (
    <section
      className={`flex h-full flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+4.5rem)] text-white ${tone}`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{kicker}</p>
      <p className="mt-10 text-7xl">{emoji}</p>
      <div className="mt-6 flex flex-1 flex-col [&_h2]:text-4xl [&_h2]:leading-tight">{children}</div>
    </section>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-3 text-center backdrop-blur">
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-white/70">{label}</p>
    </div>
  );
}

/** Where closing the recap returns to; only same-site paths, never another host. */
function safeBack(value: string | string[] | undefined, fallback: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

export default async function RecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();
  const closeHref = safeBack((await searchParams).back, `/matches/${matchId}`);

  const playerId = session.user.playerId != null ? Number(session.user.playerId) : null;
  const recap = await getMatchRecap(matchId, playerId);
  if (!recap) notFound();
  const { digest, me, rating, motm, bestDuo, myDuo } = recap;

  const baseUrl = await getBaseUrl();
  const shareUrl = baseUrl ? `${baseUrl}/share/match/${matchId}` : "";

  if (!digest.hasResult) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <Link href={closeHref} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          ← Back
        </Link>
        <p className="mt-6 text-sm text-neutral-500">The recap appears once the matchday is closed.</p>
      </main>
    );
  }

  const record = me ? `${me.w}W · ${me.d}D · ${me.l}L` : "";
  const dayVerdict = !me
    ? null
    : me.l === 0 && me.w > 0
      ? "Unbeaten night. Your side ran the show."
      : me.w > me.l
        ? "More wins than losses. A good night's work."
        : me.w === me.l
          ? "Honours even. Next week decides it."
          : "Tough night. The table resets next week.";
  const ratingDelta = rating ? rating.newFinal - rating.prevFinal : 0;
  const rankDelta = rating?.prevRank != null && rating.newRank != null ? rating.prevRank - rating.newRank : 0;
  const isMotm = motm != null && playerId != null && motm.playerId === playerId;

  const cards: ReactNode[] = [];
  if (me) {
    cards.push(
      <Card key="day" tone="bg-gradient-to-br from-emerald-500 to-teal-800" emoji="⚽" kicker={`Your day · ${digest.playedOnLabel}`}>
        <h2 className="font-bold">You played for {me.teamName}</h2>
        <p className="mt-1 text-sm text-white/80">{dayVerdict}</p>
        <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
          <Stat value={me.goals} label="Goals" />
          <Stat value={me.assists} label="Assists" />
          <Stat value={me.rounds} label="Rounds" />
        </div>
        <p className="mt-3 text-center text-sm font-medium text-white/80">{record}</p>
      </Card>,
    );
  }
  if (rating) {
    cards.push(
      <Card
        key="rating"
        tone={ratingDelta >= 0 ? "bg-gradient-to-br from-sky-500 to-indigo-800" : "bg-gradient-to-br from-slate-500 to-slate-800"}
        emoji={ratingDelta >= 0 ? "📈" : "📉"}
        kicker="Your rating"
      >
        <h2 className="font-bold tabular-nums">
          {rating.prevFinal.toFixed(1)} → {rating.newFinal.toFixed(1)}
        </h2>
        <p className="mt-1 text-sm text-white/80">
          {ratingDelta >= 0.05
            ? `Up ${ratingDelta.toFixed(1)}. The numbers noticed.`
            : ratingDelta <= -0.05
              ? `Down ${Math.abs(ratingDelta).toFixed(1)}. One good night fixes that.`
              : "Steady as a rock."}
        </p>
        {rating.newRank != null ? (
          <div className="mt-auto pt-6">
            <Stat
              value={
                <>
                  #{rating.newRank}
                  {rankDelta !== 0 ? (
                    <span className={`ml-2 text-base ${rankDelta > 0 ? "text-lime-200" : "text-red-200"}`}>
                      {rankDelta > 0 ? `▲${rankDelta}` : `▼${-rankDelta}`}
                    </span>
                  ) : null}
                </>
              }
              label="Leaderboard"
            />
          </div>
        ) : null}
      </Card>,
    );
  }
  cards.push(
    <Card key="motm" tone="bg-gradient-to-br from-amber-400 to-orange-700" emoji="🏆" kicker="Man of the Match">
      {motm ? (
        <>
          <h2 className="font-bold">{isMotm ? "It's you!" : motm.name}</h2>
          <p className="mt-1 text-sm text-white/85">
            {isMotm
              ? `Your teammates picked you, ${motm.votes} vote${motm.votes === 1 ? "" : "s"}. Frame it.`
              : `${motm.votes} vote${motm.votes === 1 ? "" : "s"} from the squad.`}
          </p>
        </>
      ) : (
        <h2 className="font-bold">No MOTM votes this week</h2>
      )}
      {digest.topScorer ? (
        <p className="mt-auto pt-6 text-sm text-white/85">
          ⚽ Top scorer: <span className="font-semibold">{digest.topScorer.name}</span> ({digest.topScorer.goals})
        </p>
      ) : null}
    </Card>,
  );
  if (bestDuo || myDuo) {
    const duo = myDuo ?? bestDuo!;
    cards.push(
      <Card key="duo" tone="bg-gradient-to-br from-fuchsia-500 to-purple-800" emoji="🤝" kicker={myDuo ? "Your best link-up" : "Best duo"}>
        <h2 className="font-bold">
          {duo.a} → {duo.b}
        </h2>
        <p className="mt-1 text-sm text-white/85">
          {duo.count} goal{duo.count === 1 ? "" : "s"} from this connection.
        </p>
        {myDuo && bestDuo && (bestDuo.a !== myDuo.a || bestDuo.b !== myDuo.b) ? (
          <p className="mt-auto pt-6 text-sm text-white/80">
            Duo of the night: {bestDuo.a} → {bestDuo.b} ({bestDuo.count})
          </p>
        ) : null}
      </Card>,
    );
  }
  cards.push(
    <Card key="share" tone="bg-gradient-to-br from-neutral-700 to-neutral-950" emoji="📣" kicker="That's a wrap">
      <h2 className="font-bold">
        {digest.teams.map((t) => `${t.name} ${t.goals}`).join(" · ") || "Full time"}
      </h2>
      <p className="mt-1 text-sm text-white/80">Send the result to the group chat.</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <ShareButton
          text={buildDigestShareText(digest, shareUrl)}
          title="Sideline recap"
          url={shareUrl || undefined}
          label="Share result"
        />
        <Link
          href={`/matches/${matchId}`}
          className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
        >
          Full match
        </Link>
      </div>
    </Card>,
  );

  return (
    <main className="flex-1">
      <h1 className="sr-only">Matchday recap</h1>
      <StoryDeck closeHref={closeHref}>{cards}</StoryDeck>
    </main>
  );
}
