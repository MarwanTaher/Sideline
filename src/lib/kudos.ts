import "server-only";
import { sqlClient } from "@/lib/db";
import { notify } from "@/lib/push";
import { addKudosMoment } from "@/lib/moments";

export type KudosGiver = {
  playerId: number;
  name: string;
  photoUrl: string | null;
  givenAt: string;
};

export type KudosSummary = {
  count: number;
  givers: KudosGiver[];
  viewerHasGiven: boolean;
};

/** Kudos a player has received, with the list of givers (newest first). */
export async function getKudos(
  playerId: number,
  viewerId: number | null,
): Promise<KudosSummary> {
  const rows = (await sqlClient.query(
    `SELECT k.from_player_id, p.name, p.photo_url, k.created_at
       FROM player_kudos k
       JOIN players p ON p.id = k.from_player_id
      WHERE k.to_player_id = $1
      ORDER BY k.created_at DESC`,
    [playerId],
  )) as Array<{
    from_player_id: number;
    name: string;
    photo_url: string | null;
    created_at: string;
  }>;

  const givers: KudosGiver[] = rows.map((r) => ({
    playerId: Number(r.from_player_id),
    name: r.name,
    photoUrl: r.photo_url ?? null,
    givenAt: String(r.created_at),
  }));

  return {
    count: givers.length,
    givers,
    viewerHasGiven:
      viewerId != null && givers.some((g) => g.playerId === viewerId),
  };
}

/**
 * Toggle kudos from one player to another. Returns the resulting state.
 * Sends a push notification to the recipient only when kudos are newly given.
 */
export async function toggleKudos(
  fromPlayerId: number,
  toPlayerId: number,
): Promise<{ given: boolean }> {
  if (fromPlayerId === toPlayerId) {
    throw new Error("You cannot give kudos to yourself.");
  }

  const existing = (await sqlClient.query(
    `SELECT 1 FROM player_kudos WHERE from_player_id = $1 AND to_player_id = $2`,
    [fromPlayerId, toPlayerId],
  )) as Array<{ [k: string]: unknown }>;

  if (existing.length > 0) {
    await sqlClient.query(
      `DELETE FROM player_kudos WHERE from_player_id = $1 AND to_player_id = $2`,
      [fromPlayerId, toPlayerId],
    );
    return { given: false };
  }

  await sqlClient.query(
    `INSERT INTO player_kudos (from_player_id, to_player_id)
     VALUES ($1, $2)
     ON CONFLICT (from_player_id, to_player_id) DO NOTHING`,
    [fromPlayerId, toPlayerId],
  );

  // Notify the recipient (best-effort; never block the action on push).
  try {
    const nameRows = (await sqlClient.query(
      `SELECT name FROM players WHERE id = $1`,
      [fromPlayerId],
    )) as Array<{ name: string }>;
    const fromName = nameRows[0]?.name ?? "A teammate";
    try {
      await addKudosMoment(toPlayerId, fromName.split(" ")[0]);
    } catch {
      // Moments are best-effort.
    }
    await notify(
      "kudos",
      {
        title: "You got kudos!",
        body: `${fromName} gave you kudos.`,
        url: `/players/${toPlayerId}`,
        tag: `kudos-${toPlayerId}`,
      },
      { playerIds: [toPlayerId] },
    );
  } catch {
    // Push failures should not fail the kudos itself.
  }

  return { given: true };
}
