import { sqlClient } from "./db";

/**
 * Direct TypeScript port of `src/scoring.py` from the Streamlit app.
 *
 * This module mirrors the Python logic line-by-line — same multipliers, same
 * confidence damping, same SQL, same blend — so scores computed here match the
 * legacy engine. A golden-master test (`tests/scoring.golden.test.ts`) asserts
 * parity against a dump of the live Python output.
 *
 * Do not "improve" the math here without updating the golden master; the goal
 * is byte-for-byte score parity during the migration.
 */

export interface ScorePayload {
  final: number;
  peer: number;
  stat: number | null;
  has_stats: boolean;
}

type Position = "GK" | "DEF" | "MID" | "FWD";
type StatKey = "goals" | "assists" | "penalties_scored" | "penalties_conceded";
type Multipliers = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Scoring multiplier reference table (Fantasy Premier League inspired).
// ---------------------------------------------------------------------------
export const STAT_MULTIPLIERS: Multipliers = {
  GK: { goals: 2.0, assists: 1.0, penalties_scored: 1.5, penalties_conceded: -1.0 },
  DEF: { goals: 1.5, assists: 1.0, penalties_scored: 1.3, penalties_conceded: -1.3 },
  MID: { goals: 1.25, assists: 1.0, penalties_scored: 1.2, penalties_conceded: -1.0 },
  FWD: { goals: 1.0, assists: 1.2, penalties_scored: 1.0, penalties_conceded: -0.8 },
};

// ---------------------------------------------------------------------------
// Fairness policy tuning (data-confidence aware scoring).
// ---------------------------------------------------------------------------
const UNRATED_MIN_MATCHES = 1;
const PROVISIONAL_MIN_VALID_PEER_VOTES = 8;
const PROVISIONAL_MIN_STAT_MATCHES = 2;
const PEER_FULL_CONFIDENCE_VOTES = 12;
const STAT_FULL_CONFIDENCE_MATCHES = 4;
const MATCH_COUNT_FULL_CONFIDENCE = 3;
const PEER_BASE_WEIGHT = 0.6;
const STAT_BASE_WEIGHT = 0.4;
const NEUTRAL_SCORE = 50.0;

const DEFAULT_SCORING_POLICY: Record<string, number> = {
  unrated_min_matches: UNRATED_MIN_MATCHES,
  provisional_min_valid_peer_votes: PROVISIONAL_MIN_VALID_PEER_VOTES,
  provisional_min_stat_matches: PROVISIONAL_MIN_STAT_MATCHES,
  peer_full_confidence_votes: PEER_FULL_CONFIDENCE_VOTES,
  stat_full_confidence_matches: STAT_FULL_CONFIDENCE_MATCHES,
  match_count_full_confidence: MATCH_COUNT_FULL_CONFIDENCE,
  peer_base_weight: PEER_BASE_WEIGHT,
  stat_base_weight: STAT_BASE_WEIGHT,
  neutral_score: NEUTRAL_SCORE,
  conceded_stat_scale: 0.05,
};

// ---------------------------------------------------------------------------
// Small numeric helpers.
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Parse like Python `float(str(value))`: returns null for empty/invalid. */
function parseNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Emulate Python's `round(x, 2)` (round-half-to-even). */
export function round2(x: number): number {
  const scaled = x * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPS = 1e-9;
  let rounded: number;
  if (Math.abs(diff - 0.5) < EPS) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / 100;
}

/** statistics.median — average of the two middle values for even length. */
export function median(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function deepCopyMultipliers(src: Multipliers): Multipliers {
  const out: Multipliers = {};
  for (const pos of Object.keys(src)) {
    out[pos] = { ...src[pos] };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Policy + multiplier loading from app_settings.
// ---------------------------------------------------------------------------

const POLICY_ALIAS_MAP: Record<string, string> = {
  scoring_unrated_min_matches: "unrated_min_matches",
  scoring_provisional_min_valid_peer_votes: "provisional_min_valid_peer_votes",
  scoring_provisional_min_stat_matches: "provisional_min_stat_matches",
  scoring_peer_full_confidence_votes: "peer_full_confidence_votes",
  scoring_stat_full_confidence_matches: "stat_full_confidence_matches",
  scoring_match_count_full_confidence: "match_count_full_confidence",
  scoring_peer_base_weight: "peer_base_weight",
  scoring_stat_base_weight: "stat_base_weight",
  scoring_neutral_score: "neutral_score",
  scoring_conceded_stat_scale: "conceded_stat_scale",
};

export async function getScoringPolicy(): Promise<Record<string, number>> {
  const policy: Record<string, number> = { ...DEFAULT_SCORING_POLICY };
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await sqlClient.query(
      "SELECT key, value FROM app_settings WHERE key LIKE 'scoring_%'",
    )) as Array<Record<string, unknown>>;
  } catch {
    return policy;
  }

  for (const r of rows) {
    const key = POLICY_ALIAS_MAP[String(r.key)];
    if (!key) continue;
    const val = parseNum(r.value);
    if (val === null) continue;
    policy[key] = val;
  }

  // Clamp to sane ranges (mirrors Python).
  policy.unrated_min_matches = Math.max(0.0, policy.unrated_min_matches);
  policy.provisional_min_valid_peer_votes = Math.max(0.0, policy.provisional_min_valid_peer_votes);
  policy.provisional_min_stat_matches = Math.max(0.0, policy.provisional_min_stat_matches);
  policy.peer_full_confidence_votes = Math.max(1.0, policy.peer_full_confidence_votes);
  policy.stat_full_confidence_matches = Math.max(1.0, policy.stat_full_confidence_matches);
  policy.match_count_full_confidence = Math.max(1.0, policy.match_count_full_confidence);
  policy.peer_base_weight = Math.max(0.0, policy.peer_base_weight);
  policy.stat_base_weight = Math.max(0.0, policy.stat_base_weight);
  policy.neutral_score = clamp(policy.neutral_score, 0.0, 100.0);
  policy.conceded_stat_scale = Math.max(0.0, policy.conceded_stat_scale ?? 0.05);

  const totalWeight = policy.peer_base_weight + policy.stat_base_weight;
  if (totalWeight === 0) {
    policy.peer_base_weight = PEER_BASE_WEIGHT;
    policy.stat_base_weight = STAT_BASE_WEIGHT;
  } else {
    policy.peer_base_weight = policy.peer_base_weight / totalWeight;
    policy.stat_base_weight = policy.stat_base_weight / totalWeight;
  }
  return policy;
}

async function getEffectiveStatMultipliers(): Promise<Multipliers> {
  const multipliers = deepCopyMultipliers(STAT_MULTIPLIERS);
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await sqlClient.query(
      "SELECT key, value FROM app_settings WHERE key LIKE 'scoring_mult_%'",
    )) as Array<Record<string, unknown>>;
  } catch {
    return multipliers;
  }

  for (const r of rows) {
    const key = String(r.key);
    const parts = key.split("_");
    // Expected format: scoring_mult_<POS>_<STAT_KEY>
    if (parts.length < 5) continue;
    const pos = parts[2];
    const statKey = parts.slice(3).join("_");
    if (!(pos in multipliers) || !(statKey in multipliers[pos])) continue;
    const val = parseNum(r.value);
    if (val === null) continue;
    if (statKey === "penalties_conceded") {
      multipliers[pos][statKey] = Math.min(0.0, val);
    } else {
      multipliers[pos][statKey] = Math.max(0.0, val);
    }
  }
  return multipliers;
}

// ---------------------------------------------------------------------------
// Pure scoring primitives.
// ---------------------------------------------------------------------------

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0.0;
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 1) return xs[0];
  const idx = (xs.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.min(low + 1, xs.length - 1);
  const frac = idx - low;
  return xs[low] * (1 - frac) + xs[high] * frac;
}

export function filterOutlierVotes(votes: number[]): number[] {
  if (votes.length === 0) return [];
  if (votes.length < 4) return votes.map(Number);

  const fv = votes.map(Number);
  const q1 = percentile(fv, 0.25);
  const q3 = percentile(fv, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;

  const valid = fv.filter((v) => low <= v && v <= high);
  if (valid.length < 3) return [median(votes)];
  return valid;
}

export function statMetric(
  position: string,
  goals: number,
  assists: number,
  penaltiesScored: number,
  penaltiesConceded: number,
  multipliers: Multipliers,
): number {
  const m = multipliers[position] ?? multipliers.MID;
  return (
    goals * m.goals +
    assists * m.assists +
    penaltiesScored * m.penalties_scored +
    penaltiesConceded * m.penalties_conceded
  );
}

export function weightedAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  let totalWeight = 0.0;
  let weightedSum = 0.0;
  values.forEach((value, i) => {
    const weight = i < 3 ? 2.0 : 1.0;
    weightedSum += value * weight;
    totalWeight += weight;
  });
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

export function statNorm(vals: number[], raw: number | null): number {
  if (raw === null) return 50.0;
  if (vals.length === 0) return 50.0;
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  if (mx > mn) {
    return clamp(((raw - mn) / (mx - mn)) * 100.0, 0.0, 100.0);
  }
  // All equal or single player: absolute anchor 0 → 50, 5 → 75, 10 → 100.
  return clamp(50.0 + raw * 5.0, 0.0, 100.0);
}

// ---------------------------------------------------------------------------
// Main scoring entry point — port of get_player_scores().
// ---------------------------------------------------------------------------

export async function getPlayerScores(): Promise<Record<number, ScorePayload>> {
  const policy = await getScoringPolicy();

  const unratedMinMatches = Math.trunc(policy.unrated_min_matches);
  const provisionalMinValidPeerVotes = Math.trunc(policy.provisional_min_valid_peer_votes);
  const peerFullConfidenceVotes = policy.peer_full_confidence_votes;
  const statFullConfidenceMatches = policy.stat_full_confidence_matches;
  const matchCountFullConfidence = policy.match_count_full_confidence;
  const peerBaseWeight = policy.peer_base_weight;
  const statBaseWeight = policy.stat_base_weight;
  const neutralScore = policy.neutral_score;
  const multipliers = await getEffectiveStatMultipliers();

  const players = (await sqlClient.query(
    "SELECT id, preferred_position FROM players WHERE active = 1",
  )) as Array<{ id: number; preferred_position: string }>;
  if (players.length === 0) return {};

  const playerIds = players.map((p) => Number(p.id));
  const placeholders = playerIds.map((_, i) => `$${i + 1}`).join(",");

  const matchRows = (await sqlClient.query(
    `
    SELECT mp.player_id, mp.match_id, mp.team_no, m.played_on, COALESCE(m.stats_scoring_enabled, 1) AS stats_scoring_enabled
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id IN (${placeholders})
    ORDER BY m.played_on DESC, mp.match_id DESC
    `,
    playerIds,
  )) as Array<{ player_id: number; match_id: number }>;

  // Preserve query order (most-recent first) — weightedAvg weights the first 3.
  const playerMatches = new Map<number, number[]>();
  for (const row of matchRows) {
    const pid = Number(row.player_id);
    const matchId = Number(row.match_id);
    if (!playerMatches.has(pid)) playerMatches.set(pid, []);
    const list = playerMatches.get(pid)!;
    if (!list.includes(matchId)) list.push(matchId);
  }

  const voteRows = (await sqlClient.query(
    `
    SELECT match_id, voted_for_id, rating
    FROM votes
    WHERE voted_for_id IN (${placeholders})
                AND CASE
                            WHEN COALESCE(scope_status, 'in_scope') = 'in_scope' THEN 1
                            WHEN COALESCE(scope_status, 'in_scope') IN ('out_of_scope', 'removed_from_calculation') THEN 0
                            ELSE COALESCE(include_in_calculation, 1)
                        END = 1
    `,
    playerIds,
  )) as Array<{ match_id: number; voted_for_id: number; rating: number }>;

  const votesByPlayerMatch = new Map<string, number[]>();
  for (const row of voteRows) {
    const k = `${Number(row.voted_for_id)}:${Number(row.match_id)}`;
    if (!votesByPlayerMatch.has(k)) votesByPlayerMatch.set(k, []);
    votesByPlayerMatch.get(k)!.push(Number(row.rating));
  }

  // Approved stats are counted only for matches where stats scoring is enabled.
  const statRows = (await sqlClient.query(
    `
    SELECT mp.player_id,
           mp.match_id,
           COALESCE(s.goals, pss.goals, 0) AS goals,
           COALESCE(s.assists, pss.assists, 0) AS assists,
           p.preferred_position
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    JOIN matches m ON m.id = mp.match_id
    LEFT JOIN stats s
           ON s.match_id = mp.match_id
          AND s.player_id = mp.player_id
    LEFT JOIN player_stats_submissions pss
           ON pss.match_id = mp.match_id
          AND pss.player_id = mp.player_id
          AND pss.status = 'approved'
    WHERE mp.player_id IN (${placeholders})
      AND COALESCE(m.stats_scoring_enabled, 1) = 1
      AND (s.player_id IS NOT NULL OR pss.player_id IS NOT NULL)
    `,
    playerIds,
  )) as Array<{
    player_id: number;
    match_id: number;
    goals: number | null;
    assists: number | null;
    preferred_position: string | null;
  }>;

  const statMetricByPlayerMatch = new Map<string, number>();
  for (const row of statRows) {
    const pid = Number(row.player_id);
    const mid = Number(row.match_id);
    const pos = String(row.preferred_position ?? "MID");
    const goals = Number(row.goals ?? 0);
    const assists = Number(row.assists ?? 0);
    statMetricByPlayerMatch.set(`${pid}:${mid}`, statMetric(pos, goals, assists, 0, 0, multipliers));
  }

  const statRawAvgByPlayer = new Map<number, number>();
  const statMatchCountByPlayer = new Map<number, number>();
  for (const pid of playerIds) {
    const recentMatches = playerMatches.get(pid) ?? [];
    const statValues: number[] = [];
    for (const mid of recentMatches) {
      const key = `${pid}:${mid}`;
      if (statMetricByPlayerMatch.has(key)) {
        statValues.push(statMetricByPlayerMatch.get(key)!);
        statMatchCountByPlayer.set(pid, (statMatchCountByPlayer.get(pid) ?? 0) + 1);
      }
    }
    const statAvg = weightedAvg(statValues);
    if (statAvg !== null) {
      statRawAvgByPlayer.set(pid, statAvg);
    }
  }

  const statScaleValues = [...statRawAvgByPlayer.values()];
  const statScore100ByPlayer = new Map<number, number>();
  for (const [pid, raw] of statRawAvgByPlayer) {
    statScore100ByPlayer.set(pid, statNorm(statScaleValues, raw));
  }

  const peerScore100 = new Map<number, number>();
  for (const pid of playerIds) {
    const recentMatches = playerMatches.get(pid) ?? [];
    const peerValues: number[] = [];
    for (const mid of recentMatches) {
      const votes = votesByPlayerMatch.get(`${pid}:${mid}`) ?? [];
      const filtered = filterOutlierVotes(votes);
      if (filtered.length > 0) {
        peerValues.push(filtered.reduce((a, b) => a + b, 0) / filtered.length);
      }
    }
    const peerAvg = weightedAvg(peerValues);
    if (peerAvg !== null) {
      // Ratings are 0-10, map linearly to 0-100.
      peerScore100.set(pid, clamp(peerAvg * 10.0, 0.0, 100.0));
    }
  }

  const scores: Record<number, ScorePayload> = {};
  for (const pid of playerIds) {
    const matches = playerMatches.get(pid) ?? [];
    const recentMatches = matches;

    let validPeerVotes = 0;
    for (const mid of recentMatches) {
      validPeerVotes += (votesByPlayerMatch.get(`${pid}:${mid}`) ?? []).length;
    }

    // Internal state (kept for parity; not used downstream).
    void (matches.length < unratedMinMatches
      ? "unrated"
      : validPeerVotes < provisionalMinValidPeerVotes
        ? "provisional"
        : "rated");

    const peerRaw = peerScore100.get(pid) ?? neutralScore;

    let cPeer = validPeerVotes > 0 ? Math.min(1.0, validPeerVotes / peerFullConfidenceVotes) : 0.0;
    const cMatch = recentMatches.length > 0 ? Math.min(1.0, recentMatches.length / matchCountFullConfidence) : 0.0;
    cPeer *= cMatch;

    const peerAdj = neutralScore + cPeer * (peerRaw - neutralScore);
    const statRaw = statScore100ByPlayer.has(pid) ? statScore100ByPlayer.get(pid)! : null;
    const statMatchCount = statMatchCountByPlayer.get(pid) ?? 0;
    let cStat = statMatchCount > 0 ? Math.min(1.0, statMatchCount / statFullConfidenceMatches) : 0.0;
    cStat *= cMatch;
    let statAdj: number | null = null;
    if (statRaw !== null) {
      statAdj = neutralScore + cStat * (statRaw - neutralScore);
    }

    let effPeerW: number;
    let effStatW: number;
    if (statAdj === null) {
      effPeerW = 1.0;
      effStatW = 0.0;
    } else {
      effPeerW = peerBaseWeight;
      effStatW = statBaseWeight;
    }

    const final = peerAdj * effPeerW + (statAdj !== null ? statAdj : neutralScore) * effStatW;

    scores[pid] = {
      final: round2(final),
      peer: round2(peerAdj),
      stat: statAdj !== null ? round2(statAdj) : null,
      has_stats: statAdj !== null,
    };
  }

  return scores;
}
