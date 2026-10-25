import { sqlClient } from "@/lib/db";
import type { Position } from "@/lib/positions";

export interface PlayerContact {
  name: string;
  preferredPosition: Position;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
}

interface ContactRow {
  name: string;
  preferred_position: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
}

/** Load a player's editable profile details. Returns null if not found. */
export async function getPlayerContact(playerId: number): Promise<PlayerContact | null> {
  const raw = await sqlClient.query(
    `SELECT name, preferred_position, email, phone, photo_url
       FROM players WHERE id = $1`,
    [playerId],
  );
  const rows = raw as ContactRow[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    name: r.name,
    preferredPosition: r.preferred_position as Position,
    email: r.email,
    phone: r.phone,
    photoUrl: r.photo_url,
  };
}

/** Update a player's contact fields. Empty strings are stored as NULL. */
export async function updatePlayerContact(
  playerId: number,
  email: string | null,
  phone: string | null,
): Promise<void> {
  await sqlClient.query(
    `UPDATE players SET email = $2, phone = $3 WHERE id = $1`,
    [playerId, email, phone],
  );
}

/** Update a player's photo URL (already uploaded to blob storage). */
export async function updatePlayerPhoto(
  playerId: number,
  photoUrl: string | null,
): Promise<void> {
  await sqlClient.query(`UPDATE players SET photo_url = $2 WHERE id = $1`, [
    playerId,
    photoUrl,
  ]);
}
