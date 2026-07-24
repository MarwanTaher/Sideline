import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMatchDigest, scorelineText } from "@/lib/match-digest";
import { shortenName } from "@/lib/format";
import { getBaseUrl } from "@/lib/site-url";
import { ShareButton } from "@/components/share-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const matchId = Number(id);
  const digest = Number.isFinite(matchId) ? await getMatchDigest(matchId) : null;
  if (!digest) return { title: "Match · Sideline" };
  const scoreline = scorelineText(digest);
  const title = scoreline ? `${scoreline} · Sideline` : `Match ${digest.matchId} · Sideline`;
  const bits: string[] = [digest.playedOnLabel];
  if (digest.motm) bits.push(`MOTM ${shortenName(digest.motm.name)}`);
  if (digest.topScorer) bits.push(`Top scorer ${shortenName(digest.topScorer.name)}`);
  return {
    title,
    description: bits.join(" · "),
    openGraph: {
      title,
      description: bits.join(" · "),
      type: "website",
    },
  };
}

export default async function PublicMatchSummary({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) notFound();

  const digest = await getMatchDigest(matchId);
  if (!digest) notFound();

  const baseUrl = await getBaseUrl();
  const shareUrl = baseUrl ? `${baseUrl}/share/match/${matchId}` : "";
  const scoreline = scorelineText(digest);
  const shareLines = [
    `\u26bd ${digest.playedOnLabel}`,
    scoreline,
    digest.motm ? `\ud83c\udfc6 MOTM: ${shortenName(digest.motm.name)}` : "",
    digest.topScorer ? `\u26bd Top scorer: ${shortenName(digest.topScorer.name)} (${digest.topScorer.goals})` : "",
    shareUrl,
  ].filter(Boolean);
  const shareText = shareLines.join("\n");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
      <div className="rounded-2xl border border-black/10 bg-gradient-to-b from-emerald-50 to-white p-6 shadow-sm dark:border-white/10 dark:from-emerald-950/30 dark:to-neutral-950">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Sideline · {digest.playedOnLabel}
          {digest.matchTimeLabel ? ` · ${digest.matchTimeLabel}` : ""}
        </p>

        {digest.teams.length > 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            {digest.teams.map((t, i) => (
              <div key={t.teamNo} className="flex-1 text-center">
                <p className="truncate text-sm font-medium text-neutral-600 dark:text-neutral-300">{t.name}</p>
                <p className="mt-1 text-4xl font-bold tracking-tight">{t.goals}</p>
                {i < digest.teams.length - 1 ? null : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">Result not posted yet.</p>
        )}

        <div className="mt-6 space-y-2 text-sm">
          {digest.motm ? (
            <p>
              <span className="mr-1">{"\u{1F3C6}"}</span>
              <span className="text-neutral-500">Man of the Match:</span>{" "}
              <span className="font-semibold">{shortenName(digest.motm.name)}</span>
            </p>
          ) : null}
          {digest.topScorer ? (
            <p>
              <span className="mr-1">{"\u26BD"}</span>
              <span className="text-neutral-500">Top scorer:</span>{" "}
              <span className="font-semibold">{shortenName(digest.topScorer.name)}</span>{" "}
              <span className="text-neutral-500">({digest.topScorer.goals})</span>
            </p>
          ) : null}
          {digest.movers.length > 0 ? (
            <p>
              <span className="mr-1">{"\u{1F4C8}"}</span>
              <span className="text-neutral-500">Biggest movers:</span>{" "}
              <span className="font-medium">
                {digest.movers.map((m) => shortenName(m.name)).join(", ")}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ShareButton text={shareText} title="Match result" url={shareUrl} />
        <Link
          href={`/matches/${matchId}`}
          className="text-sm text-neutral-500 underline-offset-2 hover:underline"
        >
          Open in Sideline →
        </Link>
      </div>
    </main>
  );
}
