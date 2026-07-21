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
  /** Data-confidence tier: unrated < provisional < rated. */
  tier: "unrated" | "provisional" | "rated";
  /** Total valid peer votes counted for this player. */
  valid_votes: number;
  /** Distinct matches counted for this player. */
  match_count: number;
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

// ---------------------------------------------------------------------------
// Optional fairness enhancements. All default to 0/legacy so the golden-master
// engine is reproduced exactly until an admin opts in. Toggles are treated as
// enabled when > 0.
// ---------------------------------------------------------------------------
const VOTER_NORMALIZATION = 0; // de-bias harsh/lenient voters per match
const PEER_MATCH_VOTE_WEIGHTING = 0; // weight matches by how many people voted
const PEER_AGGREGATE_MODE = 0; // 0 = mean (legacy), 1 = median, 2 = trimmed mean
const BAYESIAN_SHRINKAGE = 0; // smooth shrink toward neutral instead of hard cliffs
const BAYESIAN_PRIOR_STRENGTH = 6; // "k" pseudo-votes of neutral prior
const RECENCY_DECAY = 0; // pull inactive players back toward neutral over time
const RECENCY_HALF_LIFE_DAYS = 45; // days for the decay factor to halve
const TRIMMED_MEAN_FRACTION = 0.1; // fraction trimmed from each end for mode 2

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
  voter_normalization: VOTER_NORMALIZATION,
  peer_match_vote_weighting: PEER_MATCH_VOTE_WEIGHTING,
  peer_aggregate_mode: PEER_AGGREGATE_MODE,
  bayesian_shrinkage: BAYESIAN_SHRINKAGE,
  bayesian_prior_strength: BAYESIAN_PRIOR_STRENGTH,
  recency_decay: RECENCY_DECAY,
  recency_half_life_days: RECENCY_HALF_LIFE_DAYS,
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
  scoring_voter_normalization: "voter_normalization",
  scoring_peer_match_vote_weighting: "peer_match_vote_weighting",
  scoring_peer_aggregate_mode: "peer_aggregate_mode",
  scoring_bayesian_shrinkage: "bayesian_shrinkage",
  scoring_bayesian_prior_strength: "bayesian_prior_strength",
  scoring_recency_decay: "recency_decay",
  scoring_recency_half_life_days: "recency_half_life_days",
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

  // Fairness enhancement knobs (default to legacy when unset).
  policy.voter_normalization = policy.voter_normalization > 0 ? 1 : 0;
  policy.peer_match_vote_weighting = policy.peer_match_vote_weighting > 0 ? 1 : 0;
  policy.peer_aggregate_mode = clamp(Math.trunc(policy.peer_aggregate_mode ?? 0), 0, 2);
  policy.bayesian_shrinkage = policy.bayesian_shrinkage > 0 ? 1 : 0;
  policy.bayesian_prior_strength = Math.max(0.0, policy.bayesian_prior_strength ?? BAYESIAN_PRIOR_STRENGTH);
  policy.recency_decay = policy.recency_decay > 0 ? 1 : 0;
  policy.recency_half_life_days = Math.max(1.0, policy.recency_half_life_days ?? RECENCY_HALF_LIFE_DAYS);

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

/** Weighted mean with caller-supplied weights (used for vote-count weighting). */
export function weightedAvgCustom(values: number[], weights: number[]): number | null {
  let totalWeight = 0.0;
  let weightedSum = 0.0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] ?? 0;
    weightedSum += values[i] * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/** Mean of the middle values, trimming `fraction` off each sorted end. */
export function trimmedMean(values: number[], fraction: number): number {
  if (values.length === 0) return 0.0;
  const xs = [...values].sort((a, b) => a - b);
  const k = Math.floor(xs.length * fraction);
  const kept = k > 0 && xs.length - 2 * k > 0 ? xs.slice(k, xs.length - k) : xs;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/**
 * Aggregate a match's filtered votes into a single value per the configured
 * mode: 0 = mean (legacy), 1 = median, 2 = trimmed mean.
 */
export function aggregateVotes(values: number[], mode: number): number {
  if (values.length === 0) return 0.0;
  if (mode === 1) return median(values);
  if (mode === 2) return trimmedMean(values, TRIMMED_MEAN_FRACTION);
  return values.reduce((a, b) => a + b, 0) / values.length;
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
  const voterNormalization = policy.voter_normalization > 0;
  const peerVoteWeighting = policy.peer_match_vote_weighting > 0;
  const peerAggregateMode = Math.trunc(policy.peer_aggregate_mode);
  const bayesianShrinkage = policy.bayesian_shrinkage > 0;
  const bayesianPriorStrength = policy.bayesian_prior_strength;
  const recencyDecay = policy.recency_decay > 0;
  const recencyHalfLifeDays = policy.recency_half_life_days;
  const nowMs = Date.now();
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
  )) as Array<{ player_id: number; match_id: number; played_on: string | null }>;

  // Preserve query order (most-recent first) — weightedAvg weights the first 3.
  const playerMatches = new Map<number, number[]>();
  // Most-recent played_on per player, used only for optional recency decay.
  const lastPlayedByPlayer = new Map<number, number>();
  for (const row of matchRows) {
    const pid = Number(row.player_id);
    const matchId = Number(row.match_id);
    if (!playerMatches.has(pid)) playerMatches.set(pid, []);
    const list = playerMatches.get(pid)!;
    if (!list.includes(matchId)) list.push(matchId);
    if (!lastPlayedByPlayer.has(pid) && row.played_on) {
      const t = new Date(row.played_on).getTime();
      if (Number.isFinite(t)) lastPlayedByPlayer.set(pid, t);
    }
  }

  const voteRows = (await sqlClient.query(
    `
    SELECT match_id, voter_id, voted_for_id, rating
    FROM votes
    WHERE voted_for_id IN (${placeholders})
                AND CASE
                            WHEN COALESCE(scope_status, 'in_scope') = 'in_scope' THEN 1
                            WHEN COALESCE(scope_status, 'in_scope') IN ('out_of_scope', 'removed_from_calculation') THEN 0
                            ELSE COALESCE(include_in_calculation, 1)
                        END = 1
    `,
    playerIds,
  )) as Array<{ match_id: number; voter_id: number; voted_for_id: number; rating: number }>;

  // Optional voter de-biasing: shift each voter's ballot so its mean matches the
  // match's overall mean, cancelling systematic harsh/lenient rating styles
  // while preserving the match's overall average.
  const matchMean = new Map<number, number>();
  const voterMean = new Map<string, number>();
  if (voterNormalization) {
    const matchAgg = new Map<number, { sum: number; count: number }>();
    const voterAgg = new Map<string, { sum: number; count: number }>();
    for (const row of voteRows) {
      const mid = Number(row.match_id);
      const vid = Number(row.voter_id);
      const r = Number(row.rating);
      const ma = matchAgg.get(mid) ?? { sum: 0, count: 0 };
      ma.sum += r;
      ma.count += 1;
      matchAgg.set(mid, ma);
      const vk = `${mid}:${vid}`;
      const va = voterAgg.get(vk) ?? { sum: 0, count: 0 };
      va.sum += r;
      va.count += 1;
      voterAgg.set(vk, va);
    }
    for (const [mid, agg] of matchAgg) matchMean.set(mid, agg.sum / agg.count);
    for (const [vk, agg] of voterAgg) voterMean.set(vk, agg.sum / agg.count);
  }

  const votesByPlayerMatch = new Map<string, number[]>();
  for (const row of voteRows) {
    const mid = Number(row.match_id);
    const k = `${Number(row.voted_for_id)}:${mid}`;
    let rating = Number(row.rating);
    if (voterNormalization) {
      const mm = matchMean.get(mid);
      const vm = voterMean.get(`${mid}:${Number(row.voter_id)}`);
      if (mm !== undefined && vm !== undefined) {
        rating = clamp(rating + (mm - vm), 0.0, 10.0);
      }
    }
    if (!votesByPlayerMatch.has(k)) votesByPlayerMatch.set(k, []);
    votesByPlayerMatch.get(k)!.push(rating);
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
    const peerVoteCounts: number[] = [];
    for (const mid of recentMatches) {
      const votes = votesByPlayerMatch.get(`${pid}:${mid}`) ?? [];
      const filtered = filterOutlierVotes(votes);
      if (filtered.length > 0) {
        peerValues.push(aggregateVotes(filtered, peerAggregateMode));
        peerVoteCounts.push(votes.length);
      }
    }
    // Recency weight (first 3 matches count double) optionally scaled by how
    // many people voted in each match.
    const peerAvg = peerVoteWeighting
      ? weightedAvgCustom(
          peerValues,
          peerValues.map((_, i) => (i < 3 ? 2.0 : 1.0) * peerVoteCounts[i]),
        )
      : weightedAvg(peerValues);
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

    const tier: "unrated" | "provisional" | "rated" =
      matches.length < unratedMinMatches
        ? "unrated"
        : validPeerVotes < provisionalMinValidPeerVotes
          ? "provisional"
          : "rated";

    const peerRaw = peerScore100.get(pid) ?? neutralScore;

    const cMatch = recentMatches.length > 0 ? Math.min(1.0, recentMatches.length / matchCountFullConfidence) : 0.0;

    // Optional recency decay: long inactivity pulls confidence (and thus the
    // score) back toward neutral. decay = 0.5 ^ (daysSinceLastMatch / halfLife).
    let decay = 1.0;
    if (recencyDecay) {
      const last = lastPlayedByPlayer.get(pid);
      if (last !== undefined) {
        const days = Math.max(0, (nowMs - last) / 86_400_000);
        decay = Math.pow(0.5, days / recencyHalfLifeDays);
      }
    }
    const cMatchEff = cMatch * decay;

    // Peer damping: smooth Bayesian shrinkage toward neutral, or the legacy
    // piecewise confidence ramp. Both still gated by match-count confidence.
    let peerAdj: number;
    if (bayesianShrinkage) {
      const shrunk =
        (validPeerVotes * peerRaw + bayesianPriorStrength * neutralScore) /
        (validPeerVotes + bayesianPriorStrength);
      peerAdj = neutralScore + cMatchEff * (shrunk - neutralScore);
    } else {
      let cPeer = validPeerVotes > 0 ? Math.min(1.0, validPeerVotes / peerFullConfidenceVotes) : 0.0;
      cPeer *= cMatchEff;
      peerAdj = neutralScore + cPeer * (peerRaw - neutralScore);
    }

    const statRaw = statScore100ByPlayer.has(pid) ? statScore100ByPlayer.get(pid)! : null;
    const statMatchCount = statMatchCountByPlayer.get(pid) ?? 0;
    let cStat = statMatchCount > 0 ? Math.min(1.0, statMatchCount / statFullConfidenceMatches) : 0.0;
    cStat *= cMatchEff;
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
      tier,
      valid_votes: validPeerVotes,
      match_count: matches.length,
    };
  }

  return scores;
}
