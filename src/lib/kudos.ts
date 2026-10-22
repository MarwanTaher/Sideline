import "server-only";
import { after } from "next/server";
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
    `WITH recent AS (
       SELECT k.from_player_id, p.name, p.photo_url, k.created_at
         FROM player_kudos k
         JOIN players p ON p.id = k.from_player_id
        WHERE k.to_player_id = $1
        ORDER BY k.created_at DESC
        LIMIT 16
     )
     SELECT
       (SELECT COUNT(*)::int FROM player_kudos WHERE to_player_id = $1) AS count,
       EXISTS (
         SELECT 1 FROM player_kudos
          WHERE to_player_id = $1 AND from_player_id = $2
       ) AS viewer_has_given,
       recent.from_player_id, recent.name, recent.photo_url, recent.created_at
     FROM (SELECT 1) AS anchor
     LEFT JOIN recent ON TRUE`,
    [playerId, viewerId],
  )) as Array<{
    count: number | string;
    viewer_has_given: boolean;
    from_player_id: number | null;
    name: string | null;
    photo_url: string | null;
    created_at: string | null;
  }>;

  const first = rows[0];
  const givers: KudosGiver[] = rows
    .filter(
      (r): r is typeof r & {
        from_player_id: number;
        name: string;
        created_at: string;
      } => r.from_player_id != null && r.name != null && r.created_at != null,
    )
    .map((r) => ({
      playerId: Number(r.from_player_id),
      name: r.name,
      photoUrl: r.photo_url ?? null,
      givenAt: String(r.created_at),
    }));

  return {
    count: Number(first?.count ?? 0),
    givers,
    viewerHasGiven: first?.viewer_has_given ?? false,
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

  const rows = (await sqlClient.query(
    `WITH removed AS (
       DELETE FROM player_kudos
        WHERE from_player_id = $1 AND to_player_id = $2
        RETURNING 1
     ),
     inserted AS (
       INSERT INTO player_kudos (from_player_id, to_player_id)
       SELECT $1, $2
        WHERE NOT EXISTS (SELECT 1 FROM removed)
       ON CONFLICT (from_player_id, to_player_id) DO NOTHING
       RETURNING 1
     )
     SELECT EXISTS (SELECT 1 FROM inserted) AS given`,
    [fromPlayerId, toPlayerId],
  )) as Array<{ given: boolean }>;
  const given = rows[0]?.given === true;

  if (given) {
    after(async () => {
      try {
        const nameRows = (await sqlClient.query(
          `SELECT name FROM players WHERE id = $1`,
          [fromPlayerId],
        )) as Array<{ name: string }>;
        const fromName = nameRows[0]?.name ?? "A teammate";
        try {
          await addKudosMoment(toPlayerId, fromName.split(" ")[0]);
        } catch (err) {
          console.error("Could not create the kudos moment.", err);
        }
        try {
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
        } catch (err) {
          console.error("Could not send the kudos notification.", err);
        }
      } catch (err) {
        console.error("Could not load the kudos giver name.", err);
      }
    });
  }

  return { given };
}
