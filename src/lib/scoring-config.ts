import { sqlClient } from "@/lib/db";
import { getScoringPolicy } from "@/lib/scoring";
import { getAwardsSettings } from "@/lib/awards";

/**
 * Values shown in the admin scoring-configuration form. Mirrors the Streamlit
 * `scoring_configuration_ui` inputs. Weights are expressed as a stats
 * percentage (peer = 100 - stats); everything else is a raw threshold.
 */
export interface ScoringConfigView {
  unratedMinMatches: number;
  provisionalMinValidPeerVotes: number;
  peerFullConfidenceVotes: number;
  matchCountFullConfidence: number;
  neutralScore: number;
  statWeightPct: number; // 0..100
  peerWeightPct: number; // 100 - statWeightPct
  awardsMatchMinValidVotes: number;
  awardsOverallMinValidVotes: number;
}

export interface ScoringConfigInput {
  unratedMinMatches: number;
  provisionalMinValidPeerVotes: number;
  peerFullConfidenceVotes: number;
  matchCountFullConfidence: number;
  neutralScore: number;
  statWeightPct: number;
  awardsMatchMinValidVotes: number;
  awardsOverallMinValidVotes: number;
}

export async function getScoringConfig(): Promise<ScoringConfigView> {
  const [policy, awards] = await Promise.all([getScoringPolicy(), getAwardsSettings()]);

  const statWeightPct = Math.round(policy.stat_base_weight * 100);
  const peerWeightPct = 100 - statWeightPct;

  return {
    unratedMinMatches: Math.trunc(policy.unrated_min_matches),
    provisionalMinValidPeerVotes: Math.trunc(policy.provisional_min_valid_peer_votes),
    peerFullConfidenceVotes: Math.trunc(policy.peer_full_confidence_votes),
    matchCountFullConfidence: Math.trunc(policy.match_count_full_confidence),
    neutralScore: policy.neutral_score,
    statWeightPct,
    peerWeightPct,
    awardsMatchMinValidVotes: awards.matchMinValidVotes,
    awardsOverallMinValidVotes: awards.overallMinValidVotes,
  };
}

async function setSetting(key: string, value: number): Promise<void> {
  await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)],
  );
}

/**
 * Persist the scoring policy. Follows the exact Streamlit save sequence,
 * including its quirks: `provisional_min_stat_matches` is forced to 0 and
 * `stat_full_confidence_matches` mirrors `match_count_full_confidence`.
 * Weights are stored as decimals (peer = (100 - stats)/100).
 */
export async function saveScoringConfig(input: ScoringConfigInput): Promise<void> {
  const statWeight = input.statWeightPct / 100;
  const peerWeight = (100 - input.statWeightPct) / 100;

  await setSetting("scoring_unrated_min_matches", input.unratedMinMatches);
  await setSetting("scoring_provisional_min_valid_peer_votes", input.provisionalMinValidPeerVotes);
  await setSetting("scoring_provisional_min_stat_matches", 0);
  await setSetting("scoring_peer_full_confidence_votes", input.peerFullConfidenceVotes);
  await setSetting("scoring_stat_full_confidence_matches", input.matchCountFullConfidence);
  await setSetting("scoring_match_count_full_confidence", input.matchCountFullConfidence);
  await setSetting("scoring_peer_base_weight", peerWeight);
  await setSetting("scoring_stat_base_weight", statWeight);
  await setSetting("scoring_neutral_score", input.neutralScore);
  await setSetting("scoring_awards_match_min_valid_votes", input.awardsMatchMinValidVotes);
  await setSetting("scoring_awards_overall_min_valid_votes", input.awardsOverallMinValidVotes);
}
