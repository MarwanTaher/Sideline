// Client-safe: how a stored "moment" is presented. Kept separate from the DB
// layer so the overlay (client) and unit tests can use it.

export type MomentKind =
  | "motm"
  | "number_one"
  | "hat_trick"
  | "team_reveal"
  | "top5"
  | "milestone_games"
  | "milestone_goals"
  | "badge"
  | "top_scorer"
  | "win_streak"
  | "clean_sheet"
  | "unbeaten"
  | "rank_up"
  | "waitlist_promoted"
  | "kudos"
  | "bummer_winless"
  | "bummer_rating_drop"
  | "bummer_scoreless"
  | "bummer_own_goal";

export type Moment = {
  id: number;
  kind: MomentKind;
  matchId: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type MomentTone = "epic" | "good" | "info" | "bummer";

export type MomentView = {
  emoji: string;
  title: string;
  body: string;
  tone: MomentTone;
  /** Extra line under the body (bummers: the silver lining). */
  footnote?: string;
  cta?: { href: string; label: string };
};

/** Higher = shown first. Max 3 moments are shown per app open. */
export const MOMENT_PRIORITY: Record<MomentKind, number> = {
  motm: 100,
  number_one: 95,
  hat_trick: 90,
  team_reveal: 88,
  top5: 85,
  milestone_games: 80,
  milestone_goals: 80,
  badge: 75,
  top_scorer: 70,
  win_streak: 65,
  clean_sheet: 60,
  unbeaten: 55,
  rank_up: 50,
  waitlist_promoted: 45,
  kudos: 40,
  bummer_winless: 10,
  bummer_rating_drop: 10,
  bummer_scoreless: 10,
  bummer_own_goal: 10,
};

export const MAX_MOMENTS_PER_OPEN = 3;

export function isBummer(kind: MomentKind): boolean {
  return kind.startsWith("bummer_");
}

export function sortMoments<T extends Pick<Moment, "kind" | "createdAt">>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      MOMENT_PRIORITY[b.kind] - MOMENT_PRIORITY[a.kind] ||
      String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Pick a stable variant so the same moment always reads the same. */
function pick<T>(variants: T[], seed: number): T {
  return variants[Math.abs(seed) % variants.length];
}

export function momentView(m: Moment): MomentView {
  const p = m.payload;
  const results = m.matchId > 0 ? { href: `/matches/${m.matchId}`, label: "See the match" } : undefined;
  const board = { href: "/leaderboard", label: "Open leaderboard" };
  switch (m.kind) {
    case "motm":
      return {
        emoji: "🏆",
        title: "Man of the Match!",
        body: `Your teammates voted you the best on the pitch (${plural(num(p.votes, 1), "vote")}).`,
        tone: "epic",
        cta: results,
      };
    case "number_one":
      return {
        emoji: "👑",
        title: "You're #1",
        body: "Top of the leaderboard. Everyone is chasing you now.",
        tone: "epic",
        cta: board,
      };
    case "hat_trick":
      return {
        emoji: "⚽⚽⚽",
        title: "Hat-trick hero",
        body: `${plural(num(p.goals, 3), "goal")} in one night. Somebody get the match ball.`,
        tone: "epic",
        cta: results,
      };
    case "team_reveal": {
      const mates = Array.isArray(p.teammates) ? (p.teammates as string[]).slice(0, 6).join(", ") : "";
      return {
        emoji: "🎽",
        title: `You're on ${str(p.teamName, "your team")}`,
        body: mates ? `With ${mates}.` : "Teams are out. Check who you're playing with.",
        tone: "good",
        cta: results ? { href: results.href, label: "See the teams" } : undefined,
      };
    }
    case "top5":
      return {
        emoji: "🚀",
        title: "Into the top 5",
        body: `You climbed to #${num(p.newRank, 5)} on the leaderboard.`,
        tone: "epic",
        cta: board,
      };
    case "milestone_games":
      return {
        emoji: "🎖️",
        title: `${num(p.count)} games played`,
        body: "A proper regular. Thanks for always turning up.",
        tone: "good",
        cta: { href: "/profile", label: "Your profile" },
      };
    case "milestone_goals":
      return {
        emoji: "🥅",
        title: `${num(p.count)} career goals`,
        body: "Another milestone in the books.",
        tone: "good",
        cta: { href: "/profile", label: "Your profile" },
      };
    case "badge": {
      const badges = Array.isArray(p.badges) ? (p.badges as string[]) : [];
      return {
        emoji: "🏅",
        title: badges.length > 1 ? "New badges unlocked" : "Badge unlocked",
        body: badges.join(" · ") || "You earned a new badge.",
        tone: "good",
        cta: { href: "/profile", label: "See your badges" },
      };
    }
    case "top_scorer":
      return {
        emoji: "🎯",
        title: "Top scorer of the night",
        body: `${plural(num(p.goals, 1), "goal")}. Nobody scored more.`,
        tone: "good",
        cta: results,
      };
    case "win_streak":
      return {
        emoji: "🔥",
        title: `${num(p.count, 3)} wins in a row`,
        body: "You're on fire. Keep it going next week.",
        tone: "good",
      };
    case "clean_sheet":
      return {
        emoji: "🧤",
        title: "Clean sheet",
        body: `Your team kept ${plural(num(p.rounds, 1), "clean sheet")} tonight. The wall held.`,
        tone: "good",
        cta: results,
      };
    case "unbeaten":
      return {
        emoji: "🛡️",
        title: "Unbeaten",
        body: `Your team didn't lose a single round (${num(p.w)}W ${num(p.d)}D).`,
        tone: "good",
        cta: results,
      };
    case "rank_up":
      return {
        emoji: "📈",
        title: `Up ${plural(num(p.places, 1), "place")}`,
        body: `You're now #${num(p.newRank)} on the leaderboard.`,
        tone: "info",
        cta: board,
      };
    case "waitlist_promoted":
      return {
        emoji: "🎟️",
        title: "You're off the waitlist",
        body: "A spot opened and it's yours. Can't make it? Set yourself OUT so someone else can play.",
        tone: "good",
        cta: m.matchId > 0 ? { href: `/matches/${m.matchId}/availability`, label: "Check availability" } : undefined,
      };
    case "kudos": {
      const from = Array.isArray(p.from) ? (p.from as string[]) : [];
      const who =
        from.length <= 1 ? from[0] ?? "A teammate" : `${from.slice(0, -1).join(", ")} and ${from[from.length - 1]}`;
      return {
        emoji: "👏",
        title: "You got kudos",
        body: `${who} gave you kudos.`,
        tone: "info",
        cta: { href: "/profile", label: "Your profile" },
      };
    }
    case "bummer_winless":
      return {
        emoji: pick(["🌧️", "😮‍💨", "🫠"], m.id),
        title: pick(["Tough night", "Not your night", "One to forget"], m.id),
        body: pick(
          [
            "No round wins this time. Even Messi has off days.",
            "The ball just didn't bounce your way. Next week it does.",
            "Winless tonight, but the comeback story starts now.",
          ],
          m.id,
        ),
        tone: "bummer",
        footnote: str(p.silverLining) || undefined,
      };
    case "bummer_rating_drop":
      return {
        emoji: pick(["📉", "🙃"], m.id),
        title: "Rating took a knock",
        body: pick(
          [
            `Down to ${num(p.newFinal).toFixed(1)}. One good game fixes that.`,
            `You slipped to ${num(p.newFinal).toFixed(1)}. Time for a bounce-back week.`,
          ],
          m.id,
        ),
        tone: "bummer",
        footnote: str(p.silverLining) || undefined,
      };
    case "bummer_scoreless":
      return {
        emoji: "🥶",
        title: "The goal keeps shrinking",
        body: pick(
          [
            "Three games without a goal. Strikers go cold, then they get hot again.",
            "No goals in your last three. The next one is going in off your shin, guaranteed.",
          ],
          m.id,
        ),
        tone: "bummer",
        footnote: str(p.silverLining) || undefined,
      };
    case "bummer_own_goal":
      return {
        emoji: "🙈",
        title: "Wrong net, right spirit",
        body: pick(
          [
            "An own goal tonight. Happens to the best (ask any centre-back).",
            "You found the net, just the other one. We'll call it a warm-up.",
          ],
          m.id,
        ),
        tone: "bummer",
        footnote: str(p.silverLining) || undefined,
      };
  }
}
