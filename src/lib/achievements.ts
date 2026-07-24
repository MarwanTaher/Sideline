import "server-only";
import { sqlClient } from "./db";

/**
 * Achievements / badges. These are for fun and banter only — they are computed
 * off existing play data and must NOT feed the skill rating or team balancing.
 * The mix is deliberately weighted toward attainable participation badges so a
 * casual, once-a-month player still collects some, alongside a few skill ones.
 */

export type AchievementCategory = "participation" | "skill" | "social";

export type AchievementDef = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  /** Threshold used for progress hints (appearances / goals count). */
  target?: number;
  metric?: "appearances" | "goals";
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_match", label: "Debut", description: "Played your first match.", emoji: "\ud83c\udd95", category: "participation", metric: "appearances", target: 1 },
  { key: "apps_10", label: "Regular", description: "Played 10 matches.", emoji: "\ud83d\udcc5", category: "participation", metric: "appearances", target: 10 },
  { key: "apps_25", label: "Ever-present", description: "Played 25 matches.", emoji: "\ud83e\uddf1", category: "participation", metric: "appearances", target: 25 },
  { key: "apps_50", label: "Legend", description: "Played 50 matches.", emoji: "\ud83c\udfc5", category: "participation", metric: "appearances", target: 50 },
  { key: "first_goal", label: "Off the mark", description: "Scored your first goal.", emoji: "\u26bd", category: "skill", metric: "goals", target: 1 },
  { key: "brace", label: "Brace", description: "Scored twice in a match.", emoji: "\u26bd\u26bd", category: "skill" },
  { key: "hat_trick", label: "Hat-trick hero", description: "Scored 3+ in a single match.", emoji: "\ud83c\udfa9", category: "skill" },
  { key: "playmaker", label: "Playmaker", description: "3+ assists in a single match.", emoji: "\ud83c\udfaf", category: "skill" },
  { key: "goal_machine", label: "Goal machine", description: "Scored 10 goals in total.", emoji: "\ud83d\ude80", category: "skill", metric: "goals", target: 10 },
  { key: "motm", label: "Man of the Match", description: "Won a Man of the Match vote.", emoji: "\ud83c\udfc6", category: "social" },
];

const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

export function getAchievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_KEY.get(key);
}

export type EarnedAchievement = {
  key: string;
  def: AchievementDef;
  awardedAt: string;
  detail: string;
};

type PlayerAgg = {
  appearances: number;
  totalGoals: number;
  maxGoalsInMatch: number;
  maxAssistsInMatch: number;
  motmWins: number;
};

/**
 * Compute, for every active player, the full set of achievement keys they
 * currently qualify for, based on aggregate play data.
 */
async function computeEarnedKeys(): Promise<Map<number, Set<string>>> {
  const appRows = (await sqlClient.query(
    `SELECT player_id, COUNT(DISTINCT match_id) AS n
       FROM match_players GROUP BY player_id`,
  )) as Array<{ player_id: number; n: number }>;

  const statRows = (await sqlClient.query(
    `SELECT player_id,
            COALESCE(SUM(goals), 0) AS total_goals,
            COALESCE(MAX(goals), 0) AS max_goals,
            COALESCE(MAX(assists), 0) AS max_assists
       FROM stats GROUP BY player_id`,
  )) as Array<{ player_id: number; total_goals: number; max_goals: number; max_assists: number }>;

  // MOTM winners: for each match, the nominee with the most votes (ties: all).
  const motmRows = (await sqlClient.query(
    `WITH tally AS (
       SELECT match_id, voted_for_id, COUNT(*) AS votes
         FROM match_motm_votes GROUP BY match_id, voted_for_id
     ), ranked AS (
       SELECT match_id, voted_for_id, votes,
              MAX(votes) OVER (PARTITION BY match_id) AS top
         FROM tally
     )
     SELECT voted_for_id AS player_id, COUNT(*) AS wins
       FROM ranked WHERE votes = top
      GROUP BY voted_for_id`,
  )) as Array<{ player_id: number; wins: number }>;

  const agg = new Map<number, PlayerAgg>();
  const ensure = (id: number): PlayerAgg => {
    let a = agg.get(id);
    if (!a) {
      a = { appearances: 0, totalGoals: 0, maxGoalsInMatch: 0, maxAssistsInMatch: 0, motmWins: 0 };
      agg.set(id, a);
    }
    return a;
  };
  for (const r of appRows) ensure(Number(r.player_id)).appearances = Number(r.n);
  for (const r of statRows) {
    const a = ensure(Number(r.player_id));
    a.totalGoals = Number(r.total_goals);
    a.maxGoalsInMatch = Number(r.max_goals);
    a.maxAssistsInMatch = Number(r.max_assists);
  }
  for (const r of motmRows) ensure(Number(r.player_id)).motmWins = Number(r.wins);

  const earned = new Map<number, Set<string>>();
  for (const [playerId, a] of agg) {
    const keys = new Set<string>();
    if (a.appearances >= 1) keys.add("first_match");
    if (a.appearances >= 10) keys.add("apps_10");
    if (a.appearances >= 25) keys.add("apps_25");
    if (a.appearances >= 50) keys.add("apps_50");
    if (a.totalGoals >= 1) keys.add("first_goal");
    if (a.maxGoalsInMatch >= 2) keys.add("brace");
    if (a.maxGoalsInMatch >= 3) keys.add("hat_trick");
    if (a.maxAssistsInMatch >= 3) keys.add("playmaker");
    if (a.totalGoals >= 10) keys.add("goal_machine");
    if (a.motmWins >= 1) keys.add("motm");
    if (keys.size > 0) earned.set(playerId, keys);
  }
  return earned;
}

export type NewlyUnlocked = {
  playerId: number;
  key: string;
  def: AchievementDef;
};

/**
 * Award any newly-qualified achievements across all players and return the ones
 * that were just unlocked (so callers can notify). Idempotent: existing rows
 * are skipped via the unique (player_id, achievement_key) constraint.
 */
export async function syncAchievements(matchId?: number): Promise<NewlyUnlocked[]> {
  const earned = await computeEarnedKeys();

  const existingRows = (await sqlClient.query(
    `SELECT player_id, achievement_key FROM player_achievements`,
  )) as Array<{ player_id: number; achievement_key: string }>;
  const existing = new Set(existingRows.map((r) => `${r.player_id}:${r.achievement_key}`));

  const unlocked: NewlyUnlocked[] = [];
  for (const [playerId, keys] of earned) {
    for (const key of keys) {
      if (existing.has(`${playerId}:${key}`)) continue;
      const def = ACHIEVEMENT_BY_KEY.get(key);
      if (!def) continue;
      await sqlClient.query(
        `INSERT INTO player_achievements (player_id, achievement_key, match_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, achievement_key) DO NOTHING`,
        [playerId, key, matchId ?? null],
      );
      unlocked.push({ playerId, key, def });
    }
  }
  return unlocked;
}

/** Achievements a player has earned, newest first. */
export async function getPlayerAchievements(playerId: number): Promise<EarnedAchievement[]> {
  const rows = (await sqlClient.query(
    `SELECT achievement_key, detail, awarded_at
       FROM player_achievements
      WHERE player_id = $1
      ORDER BY awarded_at DESC`,
    [playerId],
  )) as Array<{ achievement_key: string; detail: string; awarded_at: string }>;
  const out: EarnedAchievement[] = [];
  for (const r of rows) {
    const def = ACHIEVEMENT_BY_KEY.get(r.achievement_key);
    if (!def) continue;
    out.push({ key: r.achievement_key, def, awardedAt: String(r.awarded_at), detail: String(r.detail ?? "") });
  }
  return out;
}

/**
 * Achievements a player currently qualifies for, computed live from play data
 * and merged with any persisted award timestamps. This makes badges appear
 * immediately (e.g. the Debut badge after a first match) without waiting for a
 * matchday-close sync — the persisted table is only used for the "awarded on"
 * date and unlock notifications.
 */
export async function getPlayerAchievementsLive(playerId: number): Promise<EarnedAchievement[]> {
  const [earnedMap, persistedRows] = await Promise.all([
    computeEarnedKeys(),
    sqlClient.query(
      `SELECT achievement_key, detail, awarded_at
         FROM player_achievements WHERE player_id = $1`,
      [playerId],
    ) as unknown as Promise<Array<{ achievement_key: string; detail: string; awarded_at: string }>>,
  ]);

  const persisted = new Map(
    persistedRows.map((r) => [
      r.achievement_key,
      { awardedAt: String(r.awarded_at), detail: String(r.detail ?? "") },
    ]),
  );

  const keys = earnedMap.get(playerId) ?? new Set<string>();
  const out: EarnedAchievement[] = [];
  // Preserve the catalog order so the grid is stable and grouped by category.
  for (const def of ACHIEVEMENTS) {
    if (!keys.has(def.key)) continue;
    const p = persisted.get(def.key);
    out.push({
      key: def.key,
      def,
      awardedAt: p?.awardedAt ?? "",
      detail: p?.detail ?? "",
    });
  }
  return out;
}

