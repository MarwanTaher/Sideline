/**
 * Tenancy classification of every table (docs/platform/01-M1-TENANCY-FOUNDATION.md §4).
 *
 * `tests/tenancy-inventory.test.ts` fails when a migration or a lazily created
 * table is missing from this list, so every new table needs an explicit
 * decision about whether it belongs to a group.
 *
 * - `group`: owned by one group; gets `group_id` in M1 and RLS in M2.
 * - `identity`: per-player login and device data; gets `group_id` in M1 and
 *   moves to accounts in M3.
 * - `platform`: shared across groups; no `group_id`, no RLS.
 * - `unused`: no code reads or writes it; not migrated, candidate for removal.
 *
 * `area` is the M1 migration that adds the column (0041 roots, 0043 match,
 * 0044 season/money, 0045 social/identity).
 */
export type TenancyScope = "group" | "identity" | "platform" | "unused";
export type TenancyArea = "roots" | "match" | "season" | "social" | "identity" | null;

export const TENANCY_TABLES: Record<string, { scope: TenancyScope; area: TenancyArea }> = {
  // Platform
  groups: { scope: "platform", area: null },
  app_errors: { scope: "platform", area: null }, // gets a nullable group_id for diagnostics
  rate_limits: { scope: "platform", area: null }, // created lazily by src/lib/rate-limit.ts

  // Unused: left over from the Streamlit admin login; Auth.js replaced it.
  // Dropped by 0042 (it is still created by 0000, so it stays listed).
  admin_sessions: { scope: "unused", area: null },

  // Group roots: no group-owned parent
  players: { scope: "group", area: "roots" },
  matches: { scope: "group", area: "roots" },
  seasons: { scope: "group", area: "roots" },
  admins: { scope: "group", area: "roots" },
  app_settings: { scope: "group", area: "roots" },
  award_overrides: { scope: "group", area: "roots" },
  award_override_audit: { scope: "group", area: "roots" },
  score_cache_state: { scope: "group", area: "roots" },
  score_cache_snapshots: { scope: "group", area: "roots" },
  legacy_score_snapshots: { scope: "group", area: "roots" },
  legacy_defensive_stats: { scope: "group", area: "roots" },

  // Match children
  match_availability: { scope: "group", area: "match" },
  match_guests: { scope: "group", area: "match" },
  match_players: { scope: "group", area: "match" },
  match_rounds: { scope: "group", area: "match" },
  round_goals: { scope: "group", area: "match" },
  match_scorekeepers: { scope: "group", area: "match" },
  match_waitlist: { scope: "group", area: "match" },
  match_motm_votes: { scope: "group", area: "match" },
  match_reactions: { scope: "group", area: "match" },
  matchday_settlements: { scope: "group", area: "match" },
  votes: { scope: "group", area: "match" },
  vote_skips: { scope: "group", area: "match" },
  vote_audit: { scope: "group", area: "match" },
  stats: { scope: "group", area: "match" },
  stats_audit: { scope: "group", area: "match" },
  player_stats_submissions: { scope: "group", area: "match" },
  player_goals_claims: { scope: "group", area: "match" },
  predictions: { scope: "group", area: "match" },
  payments: { scope: "group", area: "match" },
  guest_charges: { scope: "group", area: "match" },
  multisport_scans: { scope: "group", area: "match" },

  // Season, money and ledger
  season_subscriptions: { scope: "group", area: "season" },
  season_invoices: { scope: "group", area: "season" },
  season_credits: { scope: "group", area: "season" },
  season_match_automation: { scope: "group", area: "season" },
  season_match_occurrences: { scope: "group", area: "season" },
  match_automation_audit: { scope: "group", area: "season" },
  fund_adjustments: { scope: "group", area: "season" },
  fund_entries: { scope: "group", area: "season" },
  dues: { scope: "group", area: "season" },
  seat_offers: { scope: "group", area: "season" },
  seat_offer_requests: { scope: "group", area: "season" },

  // Social and recognition
  player_achievements: { scope: "group", area: "social" },
  player_kudos: { scope: "group", area: "social" },
  player_moments: { scope: "group", area: "social" },
  stories: { scope: "group", area: "social" },
  story_reactions: { scope: "group", area: "social" },
  story_views: { scope: "group", area: "social" },
  admin_tab_locks: { scope: "group", area: "social" },

  // Identity (moves to accounts in M3)
  player_credentials: { scope: "identity", area: "identity" },
  player_access_tokens: { scope: "identity", area: "identity" },
  password_reset_requests: { scope: "identity", area: "identity" },
  password_reset_tokens: { scope: "identity", area: "identity" },
  push_subscriptions: { scope: "identity", area: "identity" },
  push_preferences: { scope: "identity", area: "identity" },
};

/** Tables that get a `group_id` column in M1. */
export const GROUP_ID_TABLES = Object.entries(TENANCY_TABLES)
  .filter(([, t]) => t.scope === "group" || t.scope === "identity")
  .map(([name]) => name)
  .sort();
