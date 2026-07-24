import { randomBytes } from "node:crypto";
import { sqlClient } from "./db";

/** Default lifetime for newly-minted magic links (days). */
const TOKEN_TTL_DAYS = 180;

/**
 * Ensure the optional `expires_at` column exists. Idempotent and guarded so it
 * runs at most once per cold start. Legacy tokens created before this column
 * keep a NULL expiry (treated as "never expires") for backward compatibility;
 * only newly-created links get a finite lifetime.
 */
let columnReady: Promise<void> | null = null;
function ensureExpiryColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = sqlClient
      .query(
        `ALTER TABLE player_access_tokens
           ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
      )
      .then(() => undefined)
      .catch((err) => {
        columnReady = null;
        throw err;
      });
  }
  return columnReady;
}

/** Create a persistent player access token (magic-link). Mirrors Streamlit
 * `create_player_access_token`: token_urlsafe(24), active = 1. New tokens now
 * carry a finite expiry so a leaked link cannot grant access forever. */
export async function createPlayerAccessToken(playerId: number): Promise<string> {
  await ensureExpiryColumn();
  const token = randomBytes(24).toString("base64url");
  await sqlClient.query(
    `INSERT INTO player_access_tokens (player_id, token, active, expires_at)
     VALUES ($1, $2, 1, NOW() + ($3 || ' days')::interval)`,
    [playerId, token, String(TOKEN_TTL_DAYS)],
  );
  return token;
}

/** Resolve an active, unexpired access token to a player id (and active-player
 * check). Tokens with a NULL expiry (legacy links) never expire. */
export async function resolvePlayerFromAccessToken(
  token: string | null | undefined,
): Promise<{ playerId: number; name: string } | null> {
  const t = String(token ?? "").trim();
  if (!t) return null;
  await ensureExpiryColumn();
  const rows = (await sqlClient.query(
    `
    SELECT p.id, p.name
    FROM player_access_tokens t
    JOIN players p ON p.id = t.player_id
    WHERE t.token = $1 AND t.active = 1 AND p.active = 1
      AND (t.expires_at IS NULL OR t.expires_at > NOW())
    LIMIT 1
    `,
    [t],
  )) as unknown as Array<{ id: number; name: string }>;
  if (rows.length === 0) return null;
  return { playerId: Number(rows[0].id), name: String(rows[0].name) };
}

/** Revoke every active access token for a player. Mirrors Streamlit
 * "Revoke all links": sets active = 0 and stamps revoked_at. Returns the
 * number of links revoked. */
export async function revokePlayerAccessTokens(playerId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `
    UPDATE player_access_tokens
    SET active = 0, revoked_at = CURRENT_TIMESTAMP
    WHERE player_id = $1 AND active = 1
    RETURNING id
    `,
    [playerId],
  )) as unknown as Array<{ id: number }>;
  return rows.length;
}

/** Count active (non-revoked) access tokens per player. Returns a map of
 * player_id -> active link count. */
export async function getActiveLinkCounts(): Promise<Map<number, number>> {
  const rows = (await sqlClient.query(
    `
    SELECT player_id, COUNT(*)::int AS n
    FROM player_access_tokens
    WHERE active = 1
    GROUP BY player_id
    `,
  )) as unknown as Array<{ player_id: number; n: number }>;
  const map = new Map<number, number>();
  for (const r of rows) map.set(Number(r.player_id), Number(r.n));
  return map;
}
