import "server-only";
import { sqlClient } from "./db";

/**
 * Match reactions: a bounded, ephemeral set of emoji a rostered player can
 * toggle on a match. Deliberately NOT a comment thread — banter and discussion
 * stay in the WhatsApp group (see the "Share to WhatsApp" flow). This is just
 * the lightweight "👍🔥😂" layer described in the new-features review.
 */

export const REACTION_EMOJIS = ["👍", "🔥", "😂", "⚽", "🎯", "🧤"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type ReactionSummaryItem = {
  emoji: string;
  count: number;
  mine: boolean;
};

function isAllowed(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}

async function isOnRoster(matchId: number, playerId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT 1 FROM match_players WHERE match_id = $1 AND player_id = $2 LIMIT 1`,
    [matchId, playerId],
  )) as unknown[];
  return rows.length > 0;
}

/**
 * Toggle a reaction for a player on a match. Adds it if absent, removes it if
 * present. Returns the new state (true = now reacting) or null when rejected.
 */
export async function toggleReaction(
  matchId: number,
  playerId: number,
  emoji: string,
): Promise<boolean | null> {
  if (!isAllowed(emoji)) return null;
  if (!(await isOnRoster(matchId, playerId))) return null;

  const existing = (await sqlClient.query(
    `SELECT 1 FROM match_reactions WHERE match_id = $1 AND player_id = $2 AND emoji = $3`,
    [matchId, playerId, emoji],
  )) as unknown[];

  if (existing.length > 0) {
    await sqlClient.query(
      `DELETE FROM match_reactions WHERE match_id = $1 AND player_id = $2 AND emoji = $3`,
      [matchId, playerId, emoji],
    );
    return false;
  }
  await sqlClient.query(
    `INSERT INTO match_reactions (match_id, player_id, emoji) VALUES ($1, $2, $3)
     ON CONFLICT (match_id, player_id, emoji) DO NOTHING`,
    [matchId, playerId, emoji],
  );
  return true;
}

/**
 * Per-emoji counts for a match, in the canonical emoji order, annotated with
 * whether `viewerId` has reacted with each. Emojis with zero reactions are
 * still returned so the UI can render the full palette.
 */
export async function getReactionSummary(
  matchId: number,
  viewerId: number | null,
): Promise<ReactionSummaryItem[]> {
  const rows = (await sqlClient.query(
    `SELECT emoji,
            COUNT(*) AS count,
            BOOL_OR(player_id = $2) AS mine
       FROM match_reactions
      WHERE match_id = $1
      GROUP BY emoji`,
    [matchId, viewerId ?? -1],
  )) as Array<{ emoji: string; count: number; mine: boolean }>;

  const byEmoji = new Map(rows.map((r) => [r.emoji, r]));
  return REACTION_EMOJIS.map((emoji) => {
    const r = byEmoji.get(emoji);
    return {
      emoji,
      count: r ? Number(r.count) : 0,
      mine: r ? Boolean(r.mine) : false,
    };
  });
}
