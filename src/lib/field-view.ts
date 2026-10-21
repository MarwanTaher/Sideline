// Client-safe helpers for the match Field view (kits, feature switches,
// formation layout, team balance). No DB imports.

export const KITS = {
  green: { label: "Green", bg: "#059669", fg: "#ffffff" },
  blue: { label: "Blue", bg: "#2563eb", fg: "#ffffff" },
  orange: { label: "Orange", bg: "#ea580c", fg: "#ffffff" },
  red: { label: "Red", bg: "#dc2626", fg: "#ffffff" },
  purple: { label: "Purple", bg: "#7c3aed", fg: "#ffffff" },
  yellow: { label: "Yellow", bg: "#eab308", fg: "#1c1917" },
  white: { label: "White", bg: "#f5f5f4", fg: "#1c1917" },
  black: { label: "Black", bg: "#262626", fg: "#ffffff" },
  pink: { label: "Pink", bg: "#db2777", fg: "#ffffff" },
  teal: { label: "Teal", bg: "#0d9488", fg: "#ffffff" },
} as const;

export type KitKey = keyof typeof KITS;
export const KIT_KEYS = Object.keys(KITS) as KitKey[];
const DEFAULT_ORDER: KitKey[] = ["green", "blue", "orange", "purple", "red"];

export function isKitKey(v: unknown): v is KitKey {
  return typeof v === "string" && v in KITS;
}

/** Default kit for the n-th team (1-based) when the admin hasn't picked one. */
export function defaultKit(teamNo: number): KitKey {
  return DEFAULT_ORDER[(Math.max(1, Math.trunc(teamNo)) - 1) % DEFAULT_ORDER.length];
}

export function kitFor(teamNo: number, color?: string | null): (typeof KITS)[KitKey] {
  return KITS[isKitKey(color) ? color : defaultKit(teamNo)];
}

/** Parse/clean the matches.team_colors JSON into { teamNo: kitKey }. */
export function parseTeamColors(value: unknown): Record<number, KitKey> {
  let obj: unknown = value;
  if (typeof value === "string") {
    if (value.trim() === "") return {};
    try {
      obj = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object") return {};
  const out: Record<number, KitKey> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0 && n <= 20 && isKitKey(v)) out[n] = v;
  }
  return out;
}

// ── Admin feature switches ────────────────────────────────────────────────

export const FIELD_FEATURES = {
  kits: { label: "Team kit colours", hint: "Each team in its own colour." },
  swipe: { label: "Swipeable pitches", hint: "One pitch per screen with team tabs; opens on your team." },
  glow: { label: "Highlight me", hint: "Your own circle glows softly." },
  formation: { label: "Formation layout", hint: "Players on real lines with a formation label." },
  balance: { label: "Balance meter (admins)", hint: "Team strength bars, visible to admins only." },
  live: { label: "Live goals & MOTM", hint: "⚽ / 🅰 counts and the 👑 on the field." },
  card: { label: "Tap for player card", hint: "Position, this match's stats, form and profile link." },
  share: { label: "Share lineup image", hint: "Players can share a picture of the lineups." },
} as const;

export type FieldFeature = keyof typeof FIELD_FEATURES;
export type FieldFeatures = Record<FieldFeature, boolean>;
export const FIELD_FEATURE_KEYS = Object.keys(FIELD_FEATURES) as FieldFeature[];

/** Every switch defaults ON; stored JSON only records explicit values. */
export function parseFieldFeatures(raw: unknown): FieldFeatures {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const v: unknown = JSON.parse(raw);
      if (v && typeof v === "object") obj = v as Record<string, unknown>;
    } catch {
      // Ignore junk; fall back to defaults.
    }
  }
  return Object.fromEntries(FIELD_FEATURE_KEYS.map((k) => [k, obj[k] !== false])) as FieldFeatures;
}

// ── Formation layout ──────────────────────────────────────────────────────

export const LINES = ["FWD", "MID", "DEF", "GK"] as const;
export type Line = (typeof LINES)[number];

export function normLine(value: string): Line {
  const s = value.toUpperCase();
  return (LINES as readonly string[]).includes(s) ? (s as Line) : "MID";
}

/** Vertical position (% from top) of each line; attack upward. */
const LINE_Y: Record<Line, number> = { FWD: 17, MID: 42, DEF: 66, GK: 87 };

export type Spot<T> = { item: T; line: Line; x: number; y: number };

/**
 * Place players on their lines, spread evenly across the width. Crowded lines
 * (more than 4) split into two staggered rows so names never overlap.
 */
export function layoutFormation<T>(items: T[], lineOf: (t: T) => string): Spot<T>[] {
  const byLine: Record<Line, T[]> = { FWD: [], MID: [], DEF: [], GK: [] };
  for (const it of items) byLine[normLine(lineOf(it))].push(it);
  const spots: Spot<T>[] = [];
  for (const line of LINES) {
    const list = byLine[line];
    const rows = list.length > 4 ? [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))] : [list];
    rows.forEach((row, r) => {
      const y = LINE_Y[line] + (rows.length > 1 ? (r === 0 ? -5 : 5) : 0);
      row.forEach((item, i) => {
        const x = ((i + 1) / (row.length + 1)) * 100;
        spots.push({ item, line, x, y });
      });
    });
  }
  return spots;
}

/** Outfield shape DEF-MID-FWD, e.g. "2-1-2"; trailing empty lines dropped. */
export function formationLabel(lines: string[]): string {
  const count = { DEF: 0, MID: 0, FWD: 0 } as Record<string, number>;
  for (const l of lines) {
    const n = normLine(l);
    if (n !== "GK") count[n] += 1;
  }
  const bands = [count.DEF, count.MID, count.FWD];
  let end = bands.length;
  while (end > 0 && bands[end - 1] === 0) end -= 1;
  return end ? bands.slice(0, end).join("-") : "—";
}

// ── Balance ───────────────────────────────────────────────────────────────

export type TeamStrength = { teamNo: number; avg: number; total: number; count: number };

/**
 * Summarise how even the teams are. `spreadPct` is (strongest − weakest) avg
 * as a % of the weakest; ≤ 5% is "fair", ≤ 10% "close", above that "uneven".
 */
export function balanceSummary(teams: { teamNo: number; scores: number[] }[]): {
  teams: TeamStrength[];
  spreadPct: number;
  verdict: "fair" | "close" | "uneven";
} {
  const strengths = teams
    .filter((t) => t.scores.length > 0)
    .map((t) => {
      const total = t.scores.reduce((s, x) => s + x, 0);
      return { teamNo: t.teamNo, total, count: t.scores.length, avg: total / t.scores.length };
    });
  if (strengths.length < 2) return { teams: strengths, spreadPct: 0, verdict: "fair" };
  const avgs = strengths.map((s) => s.avg);
  const lo = Math.min(...avgs);
  const hi = Math.max(...avgs);
  const spreadPct = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : 0;
  return { teams: strengths, spreadPct, verdict: spreadPct <= 5 ? "fair" : spreadPct <= 10 ? "close" : "uneven" };
}
