import type { ReactNode } from "react";
import Link from "next/link";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "How scores work · Sideline",
};

type Tier = "unrated" | "provisional" | "rated";

const TIER_STYLE: Record<Tier, string> = {
  unrated:
    "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  provisional:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  rated:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
};

function Pill({ tier }: { tier: Tier }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLE[tier]}`}
    >
      {tier}
    </span>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="border-b border-black/10 pb-2 text-xl font-semibold tracking-tight dark:border-white/10">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 text-base font-semibold text-neutral-900 dark:text-neutral-100">
      {children}
    </h3>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-neutral-100 px-4 py-3 font-mono text-[13px] leading-relaxed text-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-200">
      {children}
    </div>
  );
}

function Callout({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  const styles =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20"
      : "border-blue-500/40 bg-blue-50/70 dark:bg-blue-950/20";
  return (
    <div className={`rounded-xl border p-4 ${styles}`}>
      <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h4>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-4 dark:bg-emerald-950/15">
      <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        {title}
      </h4>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function Table({
  head,
  rows,
  numericCols = [],
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  /** Column indices to right-align (numeric). */
  numericCols?: number[];
}) {
  const numeric = new Set(numericCols);
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-50 dark:bg-neutral-900">
            {head.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-200 ${
                  numeric.has(i) ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={r}
              className="border-t border-black/5 dark:border-white/5"
            >
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-2 align-top text-neutral-700 dark:text-neutral-300 ${
                    numeric.has(c) ? "text-right tabular-nums" : "text-left"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[13px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
      {children}
    </code>
  );
}

const CONTENTS: { href: string; label: string }[] = [
  { href: "#scale", label: "The 0–10 rating scale" },
  { href: "#bigpicture", label: "The big picture: how a final score is built" },
  { href: "#tiers", label: "Confidence tiers" },
  { href: "#peer", label: "Peer score, step by step" },
  { href: "#stats", label: "Stats score, step by step" },
  { href: "#blend", label: "Worked end-to-end example" },
  { href: "#settings", label: "Admin settings reference" },
  { href: "#advanced", label: "Advanced fairness settings" },
  { href: "#matchtoggle", label: "Per-match: “Include stats in scoring”" },
  { href: "#glossary", label: "Quick glossary" },
];

export default function HowScoringWorksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
      <SubNav
        className="mb-6"
        ariaLabel="Standings"
        items={[
          { href: "/leaderboard", label: "Leaderboard" },
          { href: "/awards", label: "Awards" },
        ]}
      />

      <div className="flex items-center gap-3">
        <SectionIcon name="leaderboard" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">
          How scores work
        </h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        How player rankings are calculated in Sideline, and what every admin
        setting does.{" "}
        <a
          href="/how-scores-work.html"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-400"
        >
          Open printable version
        </a>
        .
      </p>

      <p className="mt-6 rounded-xl border border-black/10 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300">
        Every player carries a <strong>rating from 0–100</strong>. It blends two
        independent signals — what teammates think of them (
        <strong>peer votes</strong>) and what they actually did on the pitch (
        <strong>approved stats</strong>) — and then dampens the result based on
        how much data we have, so a player with two votes can never leapfrog
        someone with two seasons of evidence.
      </p>

      <Section id="contents" title="Contents">
        <ol className="list-decimal space-y-1 pl-5">
          {CONTENTS.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="scale" title="1. The 0–10 rating scale">
        <p>
          When voting after a match, players rate each teammate from{" "}
          <strong>0 to 10</strong>. Each number has a shared descriptor so
          everyone interprets the scale the same way. <strong>5 is average</strong>{" "}
          — an ordinary, solid performance, not a bad one.
        </p>
        <Table
          head={["Rating", "Descriptor", "Tier"]}
          numericCols={[0]}
          rows={[
            ["0", "Didn’t turn up", "Low"],
            ["1", "Very poor", "Low"],
            ["2", "Poor", "Low"],
            ["3", "Below average", "Low"],
            ["4", "Fair", "Mid"],
            ["5", "Average", "Mid"],
            ["6", "Decent", "High"],
            ["7", "Good", "High"],
            ["8", "Very good", "High"],
            ["9", "Excellent", "Elite"],
            ["10", "World class", "Elite"],
          ]}
        />
        <p>
          These 0–10 votes are later mapped linearly onto the 0–100 scale (a raw
          vote average of 7.0 → 70).
        </p>
      </Section>

      <Section id="bigpicture" title="2. The big picture">
        <p>A player’s final score is a weighted blend of two adjusted sub-scores:</p>
        <Formula>final = peerAdjusted × peerWeight + statsAdjusted × statsWeight</Formula>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Peer weight</strong> and <strong>stats weight</strong> always
            add up to 100%. The default is <strong>Peer 60% / Stats 40%</strong>.
          </li>
          <li>
            If a player has <strong>no approved stats</strong>, stats weight
            becomes 0 and the final score is 100% peer-based.
          </li>
          <li>
            Both sub-scores are <em>damped toward a neutral score (default 50)</em>{" "}
            when we have little data, so new or thinly-rated players sit near the
            middle instead of at the extremes.
          </li>
        </ul>
        <Callout title="Why “damping toward neutral”?">
          <p>
            A single 9/10 vote shouldn’t make someone the best player in the club.
            Instead of trusting a raw average blindly, we scale it by a{" "}
            <strong>confidence factor</strong> between 0 and 1. Low confidence
            pulls the score back toward 50; full confidence lets the raw score
            through unchanged.
          </p>
          <Formula>adjusted = neutral + confidence × (raw − neutral)</Formula>
        </Callout>
      </Section>

      <Section id="tiers" title="3. Confidence tiers">
        <p>
          Every player is labelled with a tier that reflects how trustworthy their
          score is:
        </p>
        <Table
          head={["Tier", "Meaning", "Default rule"]}
          rows={[
            [
              <Pill key="t" tier="unrated" />,
              "Not enough matches played yet.",
              <>Fewer than <strong>1</strong> match</>,
            ],
            [
              <Pill key="t" tier="provisional" />,
              "Playing, but few peer votes so the score may still swing.",
              <>Fewer than <strong>8</strong> valid peer votes</>,
            ],
            [
              <Pill key="t" tier="rated" />,
              "Enough data for a stable, trustworthy score.",
              <><strong>8+</strong> valid peer votes</>,
            ],
          ]}
        />
        <p>
          Tiers are informational — they don’t change the maths, but they tell you
          how much to trust a number.
        </p>
      </Section>

      <Section id="peer" title="4. Peer score, step by step">
        <p>
          The peer score turns raw teammate votes into a damped 0–100 value. Five
          stages:
        </p>

        <SubHeading>Step 1 — Collect valid votes per match</SubHeading>
        <p>
          Only votes flagged as in-scope / included in calculation are counted.
          Votes an admin has removed or marked out-of-scope are ignored.
        </p>

        <SubHeading>Step 2 — Remove outliers (per match)</SubHeading>
        <p>
          Within a single match, we drop rogue votes using the interquartile-range
          (IQR) rule — the same technique used to ignore one friend’s spite-vote or
          one buddy’s inflated 10.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Fewer than 4 votes: keep them all (too few to judge outliers).</li>
          <li>
            Otherwise compute Q1 and Q3, and keep only votes within{" "}
            <Code>[Q1 − 1.5·IQR, Q3 + 1.5·IQR]</Code>.
          </li>
          <li>
            If filtering leaves fewer than 3 votes, fall back to the median of the
            original votes.
          </li>
        </ul>

        <SubHeading>Step 3 — Aggregate each match into one number</SubHeading>
        <p>
          The surviving votes for a match are collapsed to a single value. By
          default this is the <strong>mean</strong>; admins can switch to{" "}
          <strong>median</strong> or <strong>trimmed mean</strong> (see Advanced
          fairness).
        </p>

        <SubHeading>Step 4 — Combine matches (recency-weighted)</SubHeading>
        <p>
          A player’s per-match values are averaged with the{" "}
          <strong>three most recent matches counting double</strong>, so current
          form matters more than old results. The result (0–10) is multiplied by 10
          to land on 0–100.
        </p>
        <Formula>peerRaw(0–100) = weightedAverage(perMatchValues) × 10</Formula>

        <SubHeading>Step 5 — Damp by confidence</SubHeading>
        <p>Two confidence factors are multiplied together, then applied:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Vote confidence</strong> —{" "}
            <Code>min(1, validVotes / peerFullConfidenceVotes)</Code> (default full
            at 12 votes).
          </li>
          <li>
            <strong>Match confidence</strong> —{" "}
            <Code>min(1, matchesPlayed / matchCountFullConfidence)</Code> (default
            full at 3 matches).
          </li>
        </ul>
        <Formula>peerAdjusted = 50 + (voteConf × matchConf) × (peerRaw − 50)</Formula>

        <Example title="Example — a promising newcomer">
          <p>
            test_user has played <strong>2 matches</strong> and received{" "}
            <strong>6 valid votes</strong> averaging <strong>8.0/10</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>peerRaw = 8.0 × 10 = <strong>80</strong></li>
            <li>voteConf = min(1, 6 / 12) = <strong>0.5</strong></li>
            <li>matchConf = min(1, 2 / 3) = <strong>0.667</strong></li>
            <li>combined confidence = 0.5 × 0.667 = <strong>0.333</strong></li>
            <li>peerAdjusted = 50 + 0.333 × (80 − 50) = 50 + 10 = <strong>60.0</strong></li>
          </ul>
          <p>
            Even with glowing 8s, her thin sample keeps her at a modest 60 — she’ll
            climb as more data arrives.
          </p>
        </Example>
      </Section>

      <Section id="stats" title="5. Stats score, step by step">
        <p>
          The stats score rewards on-pitch output — goals, assists and penalties —
          weighted by playing position. It only uses <strong>approved</strong> stats
          from matches where stats scoring is enabled.
        </p>

        <SubHeading>Step 1 — Score each match with position multipliers</SubHeading>
        <p>
          Each stat is multiplied by a position-specific factor (inspired by Fantasy
          Premier League). A goal from a goalkeeper is worth more than a goal from a
          forward, because it’s rarer and more valuable.
        </p>
        <Table
          head={["Position", "Goal", "Assist", "Penalty scored", "Penalty conceded"]}
          numericCols={[1, 2, 3, 4]}
          rows={[
            ["GK (goalkeeper)", "2.0", "1.0", "1.5", "−1.0"],
            ["DEF (defender)", "1.5", "1.0", "1.3", "−1.3"],
            ["MID (midfielder)", "1.25", "1.0", "1.2", "−1.0"],
            ["FWD (forward)", "1.0", "1.2", "1.0", "−0.8"],
          ]}
        />
        <Formula>
          matchStat = goals·Mgoal + assists·Massist + pensScored·Mpen+ +
          pensConceded·Mpen−
        </Formula>

        <SubHeading>Step 2 — Average matches (recency-weighted)</SubHeading>
        <p>As with peer votes, the three most recent matches count double.</p>

        <SubHeading>Step 3 — Normalise across the squad</SubHeading>
        <p>
          Raw stat totals are stretched onto a 0–100 scale relative to the rest of
          the club: the lowest becomes 0, the highest becomes 100, everyone else
          sits in between. (If everyone is tied, an absolute anchor is used: 0 → 50,
          5 → 75, 10 → 100.)
        </p>

        <SubHeading>Step 4 — Damp by confidence</SubHeading>
        <p>
          Same idea as peer:{" "}
          <Code>min(1, statMatches / statFullConfidenceMatches)</Code> (default full
          at 4 matches), multiplied by match confidence, then applied around
          neutral.
        </p>

        <Example title="Example — a clinical midfielder">
          <p>
            test_user#2 (MID) across 4 stat-tracked matches averaged{" "}
            <strong>2 goals + 1 assist</strong> per game.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>matchStat = 2 × 1.25 + 1 × 1.0 = <strong>3.5</strong> per match</li>
            <li>Suppose that normalises to <strong>85</strong> against the squad’s spread.</li>
            <li>statConf = min(1, 4 / 4) = <strong>1.0</strong>, matchConf = min(1, 4 / 3) = <strong>1.0</strong></li>
            <li>statsAdjusted = 50 + 1.0 × (85 − 50) = <strong>85.0</strong></li>
          </ul>
        </Example>
      </Section>

      <Section id="blend" title="6. Worked end-to-end example">
        <Example title="Putting peer + stats together (default 60/40 blend)">
          <p>
            Take a <Pill tier="rated" /> player with:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>peerAdjusted = <strong>72</strong></li>
            <li>statsAdjusted = <strong>85</strong></li>
          </ul>
          <Formula>final = 72 × 0.60 + 85 × 0.40 = 43.2 + 34.0 = 77.2</Formula>
          <p>
            If that same player had <strong>no approved stats</strong>, stats weight
            would drop to 0 and their final score would simply be their peer score:{" "}
            <strong>72.0</strong>.
          </p>
        </Example>
      </Section>

      <Section id="settings" title="7. Admin settings reference">
        <p>
          These live on the <strong>Scoring</strong> admin page. Changing them
          recomputes everyone’s score.
        </p>

        <SubHeading>Peer / stats blend</SubHeading>
        <Table
          head={["Setting", "Default", "What it does"]}
          numericCols={[1]}
          rows={[
            [
              "Stats weight (%)",
              "40",
              "Share of the final score driven by stats. Peer weight is automatically 100 − this. Slide toward stats for a more “results-based” club, toward peer for a more “eye-test” club.",
            ],
          ]}
        />

        <SubHeading>Confidence thresholds</SubHeading>
        <Table
          head={["Setting", "Default", "What it does"]}
          numericCols={[1]}
          rows={[
            [
              "Unranked min matches",
              "1",
              <>
                Matches a player must play before leaving the{" "}
                <Pill key="p" tier="unrated" /> pool.
              </>,
            ],
            [
              "Provisional min valid peer votes",
              "8",
              <>
                Valid votes needed before a rating stops being{" "}
                <Pill key="p" tier="provisional" /> and becomes{" "}
                <Pill key="r" tier="rated" />.
              </>,
            ],
            [
              "Peer full-confidence votes",
              "12",
              "Vote count at which the peer score is fully trusted (no more damping from the vote side). Lower = quicker to trust votes.",
            ],
            [
              "Match-count full confidence",
              "3",
              "Matches at which overall data is fully trusted. Affects both peer and stats damping.",
            ],
            [
              "Neutral score",
              "50",
              "The value low-confidence scores are pulled toward. This is also where brand-new players effectively start.",
            ],
          ]}
        />
        <Callout tone="warn" title="Example — making votes count faster">
          <p>
            Drop <em>Peer full-confidence votes</em> from 12 to 6. test_user’s earlier
            example (6 votes, raw 80, 2 matches) changes: voteConf becomes{" "}
            <Code>min(1, 6/6) = 1.0</Code>, so combined confidence = 1.0 × 0.667 =
            0.667, and peerAdjusted jumps from 60.0 to <strong>70.0</strong>. Great
            for a small, close-knit group; riskier if a few voters can dominate.
          </p>
        </Callout>

        <SubHeading>Awards thresholds</SubHeading>
        <Table
          head={["Setting", "Default", "What it does"]}
          numericCols={[1]}
          rows={[
            [
              "Per-match minimum valid votes",
              "—",
              "Minimum votes a player needs in a single match to qualify for that match’s awards (e.g. Man of the Match).",
            ],
            [
              "Overall minimum valid votes",
              "—",
              "Minimum total votes to qualify for season / overall awards.",
            ],
          ]}
        />
      </Section>

      <Section id="advanced" title="8. Advanced fairness settings">
        <p>
          These are optional refinements. <strong>All default to OFF</strong>, which
          reproduces the classic scoring behaviour exactly. Turn them on to make
          scores fairer or more robust — but note that enabling any of them changes
          the numbers by design.
        </p>

        <SubHeading>Normalize voter harshness</SubHeading>
        <p>
          Re-centres each voter’s ballot so their personal average matches the match
          average. This cancels out habitually harsh or lenient voters while
          preserving the match’s overall mean.
        </p>
        <Example title="Example">
          <p>
            In a match averaging 6.5, a chronically stingy voter gives everyone ~1
            point low (their own average is 5.5). Normalization adds{" "}
            <Code>6.5 − 5.5 = +1.0</Code> to each of their votes, so their opinions
            still count but their harshness no longer drags players down.
          </p>
        </Example>

        <SubHeading>Weight matches by number of voters</SubHeading>
        <p>
          A match rated by 14 people is stronger evidence than one rated by 3. When
          on, each match’s influence is scaled by how many people voted (on top of
          the recency double-weight).
        </p>

        <SubHeading>Per-match vote aggregate</SubHeading>
        <Table
          head={["Option", "Behaviour"]}
          rows={[
            ["Mean (default)", "Simple average of surviving votes."],
            ["Median", "Middle value — maximally robust to a couple of extreme votes."],
            [
              "Trimmed mean",
              "Drops the top and bottom 10%, then averages the rest — a balance of the two.",
            ],
          ]}
        />
        <Example title="Example">
          <p>
            Votes <Code>[4, 7, 7, 8, 10]</Code>: mean = 7.2, median = 7, trimmed mean
            (drop one each end) = 7.33. Median resists that lone 10 the most.
          </p>
        </Example>

        <SubHeading>Bayesian shrinkage</SubHeading>
        <p>
          A smoother alternative to the hard vote-threshold ramp. It blends a
          player’s raw score with a neutral prior worth <em>k</em> “pseudo-votes”, so
          scores glide toward neutral when data is thin instead of stepping.
        </p>
        <Formula>shrunk = (validVotes × peerRaw + k × 50) / (validVotes + k)</Formula>
        <Example title="Example (k = 6)">
          <p>
            4 votes averaging raw 90:{" "}
            <Code>shrunk = (4×90 + 6×50) / (4+6) = (360+300)/10 = 66</Code>. The score
            is pulled from 90 toward neutral because only 4 votes back it.{" "}
            <em>Prior strength (k)</em> controls how hard: higher k = more shrinkage.
          </p>
        </Example>

        <SubHeading>Recency decay for inactivity</SubHeading>
        <p>
          Pulls long-absent players back toward neutral so the table reflects{" "}
          <em>current</em> form. Confidence decays with a configurable half-life.
        </p>
        <Formula>decay = 0.5 ^ (daysSinceLastMatch / halfLifeDays)</Formula>
        <Example title="Example (half-life = 45 days)">
          <p>
            A player who hasn’t played for 90 days:{" "}
            <Code>decay = 0.5^(90/45) = 0.5² = 0.25</Code>. Their confidence — and
            therefore how far their score sits from neutral — is quartered until they
            play again.
          </p>
        </Example>
      </Section>

      <Section id="matchtoggle" title="9. Per-match: “Include stats in scoring”">
        <p>
          Each match has an <strong>Include stats in scoring</strong> checkbox in its
          settings. When unticked, that match’s goals/assists are recorded and
          displayed but <strong>excluded from the stats score</strong>. Use it for
          friendlies, lopsided teams, or early sessions where the numbers would
          distort rankings. Peer votes from the match are unaffected.
        </p>
      </Section>

      <Section id="glossary" title="10. Quick glossary">
        <Table
          head={["Term", "Meaning"]}
          rows={[
            [
              "Valid vote",
              "A peer vote that is in-scope and included in calculation (not removed by an admin).",
            ],
            [
              "Neutral score",
              "The midpoint (default 50) that low-confidence scores are pulled toward.",
            ],
            [
              "Confidence factor",
              "A 0–1 multiplier that decides how much of a raw score is trusted.",
            ],
            [
              "Recency weighting",
              "The three most recent matches count double when averaging.",
            ],
            [
              "Outlier filtering",
              "IQR-based removal of rogue votes within a single match.",
            ],
            [
              "Normalization",
              "Stretching raw stat totals onto a 0–100 scale relative to the squad.",
            ],
          ]}
        />
      </Section>

      <p className="mt-10 border-t border-black/10 pt-4 text-xs text-neutral-500 dark:border-white/10">
        Sideline scoring reference. Defaults shown reflect the shipped
        configuration; your club’s admin may have changed them on the Scoring page.
        All “Advanced fairness” options are off unless explicitly enabled.
      </p>

      <div className="mt-6">
        <Link
          href="/leaderboard"
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Back to leaderboard
        </Link>
      </div>
    </main>
  );
}
