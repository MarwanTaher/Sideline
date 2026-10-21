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

// ── Admin-editable copy (M-1) ──────────────────────────────────────────────

export type CopyVariant = { emoji?: string; title: string; body: string };
export type MomentCopyOverrides = Partial<Record<MomentKind, CopyVariant[]>>;

export const COPY_LIMITS = { variants: 5, emoji: 8, title: 60, body: 240 } as const;

type KindInfo = {
  label: string;
  group: "celebration" | "bummer";
  placeholders: string[];
  /** Example payload for the admin preview. */
  sample: Record<string, unknown>;
};

export const MOMENT_KIND_INFO: Record<MomentKind, KindInfo> = {
  motm: { label: "Man of the Match", group: "celebration", placeholders: ["name", "votes"], sample: { votes: 4 } },
  number_one: { label: "#1 on the leaderboard", group: "celebration", placeholders: ["name"], sample: {} },
  hat_trick: { label: "Hat-trick", group: "celebration", placeholders: ["name", "goals"], sample: { goals: 3 } },
  team_reveal: {
    label: "Team reveal",
    group: "celebration",
    placeholders: ["name", "team", "teammates"],
    sample: { teamName: "Habicki", teammates: ["Adam", "Bartek", "Kuba"] },
  },
  top5: { label: "Into the top 5", group: "celebration", placeholders: ["name", "rank"], sample: { newRank: 4 } },
  milestone_games: { label: "Games milestone", group: "celebration", placeholders: ["name", "n"], sample: { count: 50 } },
  milestone_goals: { label: "Goals milestone", group: "celebration", placeholders: ["name", "n"], sample: { count: 25 } },
  badge: { label: "Badge unlocked", group: "celebration", placeholders: ["name", "badges"], sample: { badges: ["Iron man"] } },
  top_scorer: { label: "Top scorer of the night", group: "celebration", placeholders: ["name", "goals"], sample: { goals: 2 } },
  win_streak: { label: "Win streak", group: "celebration", placeholders: ["name", "streak"], sample: { count: 3 } },
  clean_sheet: { label: "Clean sheet", group: "celebration", placeholders: ["name", "n"], sample: { rounds: 2 } },
  unbeaten: { label: "Unbeaten night", group: "celebration", placeholders: ["name", "w", "d"], sample: { w: 3, d: 1 } },
  rank_up: { label: "Rank up", group: "celebration", placeholders: ["name", "n", "rank"], sample: { places: 2, newRank: 7 } },
  waitlist_promoted: { label: "Off the waitlist", group: "celebration", placeholders: ["name"], sample: {} },
  kudos: { label: "Kudos received", group: "celebration", placeholders: ["name", "from"], sample: { from: ["Adam", "Kuba"] } },
  bummer_winless: { label: "Winless night", group: "bummer", placeholders: ["name"], sample: {} },
  bummer_rating_drop: { label: "Rating drop", group: "bummer", placeholders: ["name", "rating"], sample: { newFinal: 6.4 } },
  bummer_scoreless: { label: "Goal drought", group: "bummer", placeholders: ["name"], sample: {} },
  bummer_own_goal: { label: "Own goal", group: "bummer", placeholders: ["name"], sample: {} },
};

export const MOMENT_KINDS = Object.keys(MOMENT_KIND_INFO) as MomentKind[];

const joinNames = (v: unknown): string => {
  const list = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [];
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

/** Values for `{placeholder}`s, derived from the moment payload. */
export function momentVars(m: Moment, name?: string): Record<string, string> {
  const p = m.payload;
  const first = (name ?? "").trim().split(/\s+/)[0] || "you";
  const n = num(p.count, NaN);
  return {
    name: first,
    votes: String(num(p.votes, 1)),
    goals: String(num(p.goals, 1)),
    team: str(p.teamName, "your team"),
    teammates: Array.isArray(p.teammates) ? (p.teammates as string[]).slice(0, 6).join(", ") : "",
    streak: String(num(p.count, 3)),
    rank: String(num(p.newRank)),
    n: String(
      Number.isFinite(n) ? n : m.kind === "rank_up" ? num(p.places, 1) : m.kind === "clean_sheet" ? num(p.rounds, 1) : 0,
    ),
    w: String(num(p.w)),
    d: String(num(p.d)),
    rating: num(p.newFinal).toFixed(1),
    badges: Array.isArray(p.badges) ? (p.badges as string[]).join(" · ") : "",
    from: joinNames(p.from) || "A teammate",
  };
}

/** Replace known `{placeholder}`s; unknown ones are left as typed. */
export function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : all,
  );
}

/** Trim, clamp and drop anything malformed from stored / submitted copy. */
export function sanitizeVariants(raw: unknown): CopyVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: CopyVariant[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const title = str(r.title).trim().slice(0, COPY_LIMITS.title);
    const body = str(r.body).trim().slice(0, COPY_LIMITS.body);
    if (!title && !body) continue;
    const emoji = Array.from(str(r.emoji).trim()).slice(0, COPY_LIMITS.emoji).join("");
    out.push(emoji ? { emoji, title, body } : { title, body });
    if (out.length >= COPY_LIMITS.variants) break;
  }
  return out;
}

export function sanitizeMomentCopy(raw: unknown): MomentCopyOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MomentCopyOverrides = {};
  for (const kind of MOMENT_KINDS) {
    const list = sanitizeVariants((raw as Record<string, unknown>)[kind]);
    if (list.length > 0) out[kind] = list;
  }
  return out;
}

export type MomentViewOptions = { overrides?: MomentCopyOverrides; name?: string };

/**
 * How a moment reads. Admin variants (if any) replace emoji / title / body;
 * the tone, CTA and bummer silver-lining always come from the built-in copy.
 */
export function momentView(m: Moment, opts: MomentViewOptions = {}): MomentView {
  const base = defaultMomentView(m);
  const variants = opts.overrides?.[m.kind];
  if (!variants || variants.length === 0) return base;
  const v = pick(variants, m.id);
  const vars = momentVars(m, opts.name);
  return {
    ...base,
    emoji: v.emoji || base.emoji,
    title: v.title ? fillPlaceholders(v.title, vars) : base.title,
    body: v.body ? fillPlaceholders(v.body, vars) : base.body,
  };
}

export function defaultMomentView(m: Moment): MomentView {
  const p = m.payload;
  const results = m.matchId > 0 ? { href: `/matches/${m.matchId}/recap`, label: "See your recap" } : undefined;
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
        cta: m.matchId > 0 ? { href: `/matches/${m.matchId}`, label: "See the teams" } : undefined,
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
