import "server-only";
import { sqlClient } from "./db";

export const STORY_LIMITS = { live: 5, caption: 120, bytes: 1024 * 1024 } as const;
export const STORY_REACTIONS = ["🔥", "😂", "👏", "⚽", "😮", "❤️"] as const;

export type StoryItem = {
  id: number;
  imageUrl: string;
  caption: string | null;
  matchId: number | null;
  matchPlayedOn: string | null;
  createdAt: string;
  seen: boolean;
  myReaction: string | null;
};

export type StoryGroup = {
  playerId: number;
  name: string;
  photoUrl: string | null;
  isMine: boolean;
  allSeen: boolean;
  stories: StoryItem[];
};

type Row = {
  id: number;
  player_id: number;
  name: string;
  photo_url: string | null;
  image_url: string;
  caption: string | null;
  match_id: number | null;
  played_on: string | Date | null;
  created_at: string | Date;
  seen: boolean;
  my_reaction: string | null;
};

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: string | Date | null) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Live stories grouped per player: mine first, then unseen, then newest. */
export async function listActiveStories(viewerId: number): Promise<StoryGroup[]> {
  const rows = (await sqlClient.query(
    `SELECT s.id, s.player_id, p.name, p.photo_url, s.image_url, s.caption, s.match_id,
            m.played_on, s.created_at,
            (sv.player_id IS NOT NULL) AS seen, sr.emoji AS my_reaction
       FROM stories s
       JOIN players p ON p.id = s.player_id
       LEFT JOIN matches m ON m.id = s.match_id
       LEFT JOIN story_views sv ON sv.story_id = s.id AND sv.player_id = $1::int
       LEFT JOIN story_reactions sr ON sr.story_id = s.id AND sr.player_id = $1::int
      WHERE s.expires_at > now() AND p.deleted_at IS NULL
      ORDER BY s.created_at ASC`,
    [viewerId],
  )) as Row[];

  const groups = new Map<number, StoryGroup>();
  for (const r of rows) {
    const pid = Number(r.player_id);
    let g = groups.get(pid);
    if (!g) {
      g = { playerId: pid, name: r.name, photoUrl: r.photo_url, isMine: pid === viewerId, allSeen: true, stories: [] };
      groups.set(pid, g);
    }
    const seen = pid === viewerId || Boolean(r.seen);
    if (!seen) g.allSeen = false;
    g.stories.push({
      id: Number(r.id),
      imageUrl: r.image_url,
      caption: r.caption,
      matchId: r.match_id == null ? null : Number(r.match_id),
      matchPlayedOn: day(r.played_on),
      createdAt: iso(r.created_at),
      seen,
      myReaction: r.my_reaction,
    });
  }
  const newest = (g: StoryGroup) => g.stories[g.stories.length - 1].createdAt;
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.isMine) - Number(a.isMine) ||
      Number(a.allSeen) - Number(b.allSeen) ||
      newest(b).localeCompare(newest(a)),
  );
}

export async function getPlayerPhoto(playerId: number): Promise<string | null> {
  const rows = (await sqlClient.query(`SELECT photo_url FROM players WHERE id = $1::int`, [playerId])) as Array<{
    photo_url: string | null;
  }>;
  return rows[0]?.photo_url ?? null;
}

export async function countLiveStories(playerId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT count(*)::int AS n FROM stories WHERE player_id = $1::int AND expires_at > now()`,
    [playerId],
  )) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

export async function createStory(
  playerId: number,
  imageUrl: string,
  caption: string | null,
  matchId: number | null,
): Promise<number> {
  const rows = (await sqlClient.query(
    `INSERT INTO stories (player_id, image_url, caption, match_id)
     VALUES ($1::int, $2::text, $3::text, $4::int) RETURNING id`,
    [playerId, imageUrl, caption, matchId],
  )) as Array<{ id: number }>;
  return Number(rows[0].id);
}

export async function getStoryOwner(storyId: number): Promise<{ playerId: number; imageUrl: string } | null> {
  const rows = (await sqlClient.query(`SELECT player_id, image_url FROM stories WHERE id = $1::int`, [storyId])) as Array<{
    player_id: number;
    image_url: string;
  }>;
  return rows[0] ? { playerId: Number(rows[0].player_id), imageUrl: rows[0].image_url } : null;
}

/** Records a view of a live story by someone other than its owner. */
export async function markStoryViewed(storyId: number, viewerId: number): Promise<void> {
  await sqlClient.query(
    `INSERT INTO story_views (story_id, player_id)
     SELECT s.id, $2::int FROM stories s
      WHERE s.id = $1::int AND s.player_id <> $2::int AND s.expires_at > now()
     ON CONFLICT DO NOTHING`,
    [storyId, viewerId],
  );
}

/** One reaction per viewer; null removes it. Reacting also counts as a view. */
export async function setStoryReaction(storyId: number, viewerId: number, emoji: string | null): Promise<void> {
  if (emoji == null) {
    await sqlClient.query(`DELETE FROM story_reactions WHERE story_id = $1::int AND player_id = $2::int`, [
      storyId,
      viewerId,
    ]);
    return;
  }
  await sqlClient.query(
    `INSERT INTO story_reactions (story_id, player_id, emoji)
     SELECT s.id, $2::int, $3::text FROM stories s
      WHERE s.id = $1::int AND s.player_id <> $2::int AND s.expires_at > now()
     ON CONFLICT (story_id, player_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`,
    [storyId, viewerId, emoji],
  );
  await markStoryViewed(storyId, viewerId);
}

export type StoryViewer = { name: string; photoUrl: string | null; emoji: string | null };

export async function getStoryViewers(storyId: number): Promise<StoryViewer[]> {
  const rows = (await sqlClient.query(
    `SELECT p.name, p.photo_url, sr.emoji
       FROM story_views sv
       JOIN players p ON p.id = sv.player_id
       LEFT JOIN story_reactions sr ON sr.story_id = sv.story_id AND sr.player_id = sv.player_id
      WHERE sv.story_id = $1::int
      ORDER BY (sr.emoji IS NULL), sv.seen_at DESC`,
    [storyId],
  )) as Array<{ name: string; photo_url: string | null; emoji: string | null }>;
  return rows.map((r) => ({ name: r.name, photoUrl: r.photo_url, emoji: r.emoji }));
}

export async function deleteStory(storyId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM stories WHERE id = $1::int`, [storyId]);
}

/** Removes expired stories; returns their blob URLs so the caller can delete the files. */
export async function purgeExpiredStories(): Promise<string[]> {
  const rows = (await sqlClient.query(
    `DELETE FROM stories WHERE expires_at <= now() RETURNING image_url`,
  )) as Array<{ image_url: string }>;
  return rows.map((r) => r.image_url);
}
