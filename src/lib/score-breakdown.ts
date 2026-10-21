import { sqlClient } from "./db";
import { getScoringPolicy } from "./scoring";
import { getCachedPlayerScores } from "./leaderboard";
import { fmtDate } from "./matches";

export interface BreakdownMatch {
  matchId: number;
  date: string;
  peerVote: number | null;
}

export interface ScoreBreakdown {
  peerScore: number;
  statScore: number | null;
  finalScore: number;
  matches: BreakdownMatch[];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0.0;
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 1) return xs[0];
  const idx = (xs.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.min(low + 1, xs.length - 1);
  const frac = idx - low;
  return xs[low] * (1 - frac) + xs[high] * frac;
}

function median(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0.0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

/** IQR outlier filtering, mirrors get_score_breakdown.filter_votes. */
function filterVotes(votes: number[]): number[] {
  if (votes.length === 0) return [];
  if (votes.length < 4) return votes.map((v) => v);
  const q1 = percentile(votes, 0.25);
  const q3 = percentile(votes, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const valid = votes.filter((v) => low <= v && v <= high);
  if (valid.length < 3) return [median(votes)];
  return valid;
}

/** Recency-weighted average: first 3 values weight 2.0, rest 1.0. */
function weightedAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  let totalWeight = 0.0;
  let weightedSum = 0.0;
  values.forEach((value, i) => {
    const weight = i < 3 ? 2.0 : 1.0;
    weightedSum += value * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Detailed per-player peer score breakdown (last 8 in-scope matches),
 * mirroring the Streamlit `get_score_breakdown()`. The peer/stat/final headline
 * figures are taken from the live scoring engine so they match the leaderboard.
 */
export async function getScoreBreakdown(playerId: number): Promise<ScoreBreakdown> {
  const policy = await getScoringPolicy();
  const peerFullConfidenceVotes = policy.peer_full_confidence_votes;
  const matchCountFullConfidence = policy.match_count_full_confidence;
  const neutralScore = policy.neutral_score;

  const matches = (await sqlClient.query(
    `
    SELECT m.id AS match_id, m.played_on
    FROM matches m
    WHERE m.id IN (
      SELECT v.match_id
      FROM votes v
      WHERE v.voted_for_id = $1
        AND CASE
              WHEN COALESCE(v.scope_status, 'in_scope') = 'in_scope' THEN 1
              WHEN COALESCE(v.scope_status, 'in_scope') IN ('out_of_scope', 'removed_from_calculation') THEN 0
              ELSE COALESCE(v.include_in_calculation, 1)
            END = 1
    )
    ORDER BY m.played_on DESC, m.id DESC
    LIMIT 8
    `,
    [playerId],
  )) as unknown as Array<{ match_id: number; played_on: string }>;

  if (matches.length === 0) {
    return {
      peerScore: neutralScore,
      statScore: null,
      finalScore: neutralScore,
      matches: [],
    };
  }

  const matchBreakdown: BreakdownMatch[] = [];
  const peerValues: number[] = [];
  let validPeerVotes = 0;

  for (const match of matches) {
    const matchId = Number(match.match_id);
    const voteRows = (await sqlClient.query(
      `
      SELECT rating FROM votes
      WHERE match_id = $1
        AND voted_for_id = $2
        AND CASE
              WHEN COALESCE(scope_status, 'in_scope') = 'in_scope' THEN 1
              WHEN COALESCE(scope_status, 'in_scope') IN ('out_of_scope', 'removed_from_calculation') THEN 0
              ELSE COALESCE(include_in_calculation, 1)
            END = 1
      `,
      [matchId, playerId],
    )) as unknown as Array<{ rating: number }>;

    const voteList = voteRows.map((v) => Number(v.rating));
    validPeerVotes += voteList.length;
    const filtered = filterVotes(voteList);
    const peerAvg =
      filtered.length > 0 ? filtered.reduce((a, b) => a + b, 0) / filtered.length : null;
    if (peerAvg !== null) peerValues.push(peerAvg);

    matchBreakdown.push({
      matchId,
      date: fmtDate(String(match.played_on)),
      peerVote: peerAvg,
    });
  }

  const peerAvg = weightedAvg(peerValues);
  const cMatch =
    matchBreakdown.length > 0
      ? Math.min(1.0, matchBreakdown.length / matchCountFullConfidence)
      : 0.0;

  let peerScore100 = neutralScore;
  if (peerAvg !== null) peerScore100 = clamp(peerAvg * 10.0, 0.0, 100.0);

  const cPeer =
    (validPeerVotes > 0 ? Math.min(1.0, validPeerVotes / peerFullConfidenceVotes) : 0.0) * cMatch;
  const peerAdj = neutralScore + cPeer * (peerScore100 - neutralScore);

  const scores = await getCachedPlayerScores();
  const livePayload = scores[playerId];
  const finalScore = livePayload ? livePayload.final : round2(peerAdj);
  const peerLive = livePayload ? livePayload.peer : round2(peerAdj);
  const statLive = livePayload ? livePayload.stat : null;

  return {
    peerScore: round2(peerLive),
    statScore: statLive === null ? null : round2(statLive),
    finalScore,
    matches: matchBreakdown,
  };
}
