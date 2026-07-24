import { randomBytes } from "node:crypto";
import { sqlClient } from "./db";
import { hashPlayerPassword, verifyPassword } from "./password";

export interface ResetTokenInfo {
  valid: boolean;
  reason: "ok" | "invalid" | "used" | "expired";
  playerId: number | null;
  name: string | null;
}

/**
 * Set (or replace) a player's password. Mirrors Streamlit `set_player_password`:
 * fresh 16-byte hex salt, PBKDF2-HMAC-SHA256 hash, upsert into player_credentials.
 */
export async function setPlayerPassword(playerId: number, password: string): Promise<void> {
  const saltHex = randomBytes(16).toString("hex");
  const passwordHash = hashPlayerPassword(password, saltHex);
  await sqlClient.query(
    `
    INSERT INTO player_credentials (player_id, password_salt, password_hash, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (player_id) DO UPDATE SET
      password_salt = EXCLUDED.password_salt,
      password_hash = EXCLUDED.password_hash,
      updated_at = CURRENT_TIMESTAMP
    `,
    [playerId, saltHex, passwordHash],
  );
}

/**
 * Create a pending password-reset request for a player if none is already
 * pending. Mirrors the Streamlit "Request password reset" button.
 */
export async function requestPasswordReset(
  playerId: number,
): Promise<{ ok: boolean; message: string }> {
  const player = (await sqlClient.query(
    "SELECT 1 FROM players WHERE id = $1 AND active = 1",
    [playerId],
  )) as unknown as Array<unknown>;
  if (player.length === 0) {
    return { ok: false, message: "Unknown player." };
  }

  const existing = (await sqlClient.query(
    "SELECT id FROM password_reset_requests WHERE player_id = $1 AND status = 'pending' LIMIT 1",
    [playerId],
  )) as unknown as Array<{ id: number }>;
  if (existing.length > 0) {
    return {
      ok: true,
      message: "A reset request is already pending. The admin will set a new password for you soon.",
    };
  }

  await sqlClient.query(
    "INSERT INTO password_reset_requests (player_id) VALUES ($1)",
    [playerId],
  );
  return { ok: true, message: "Reset request sent. The admin will set a new password shortly." };
}

/** Validate a reset token: existence, unused, not expired. */
export async function getResetTokenInfo(token: string): Promise<ResetTokenInfo> {
  const rows = (await sqlClient.query(
    `
    SELECT prt.player_id, p.name, prt.used, prt.expires_at
    FROM password_reset_tokens prt
    JOIN players p ON p.id = prt.player_id
    WHERE prt.token = $1
    LIMIT 1
    `,
    [token],
  )) as unknown as Array<{
    player_id: number;
    name: string;
    used: number;
    expires_at: string;
  }>;

  if (rows.length === 0) {
    return { valid: false, reason: "invalid", playerId: null, name: null };
  }
  const row = rows[0];
  if (Number(row.used) === 1) {
    return { valid: false, reason: "used", playerId: Number(row.player_id), name: String(row.name) };
  }
  // expires_at is a UTC "YYYY-MM-DD HH:MM:SS" string.
  const expires = new Date(String(row.expires_at).replace(" ", "T") + "Z");
  if (!Number.isNaN(expires.getTime()) && Date.now() > expires.getTime()) {
    return { valid: false, reason: "expired", playerId: Number(row.player_id), name: String(row.name) };
  }
  return { valid: true, reason: "ok", playerId: Number(row.player_id), name: String(row.name) };
}

/**
 * Consume a valid reset token: set the new password, mark the token used, and
 * resolve the originating request. Re-validates the token to avoid races.
 */
export async function consumeResetToken(
  token: string,
  password: string,
): Promise<{ ok: boolean; message: string }> {
  const info = await getResetTokenInfo(token);
  if (!info.valid || info.playerId === null) {
    const message =
      info.reason === "used"
        ? "This reset link has already been used."
        : info.reason === "expired"
          ? "This reset link has expired. Please request a new one."
          : "Invalid reset link.";
    return { ok: false, message };
  }

  await setPlayerPassword(info.playerId, password);
  await sqlClient.query("UPDATE password_reset_tokens SET used = 1 WHERE token = $1", [token]);
  await sqlClient.query(
    `
    UPDATE password_reset_requests
    SET status = 'resolved', resolved_by = 'player', resolved_at = CURRENT_TIMESTAMP
    WHERE player_id = $1 AND status = 'pending'
    `,
    [info.playerId],
  );
  return { ok: true, message: "Password updated successfully. You can now sign in." };
}

/**
 * Self-service password change for a signed-in player. Verifies the current
 * password against `player_credentials`; if no credentials exist yet, allows
 * setting an initial password. New password must be at least 8 characters.
 */
export async function changePlayerPassword(
  playerId: number,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string }> {
  if (newPassword.length < 8) {
    return { ok: false, message: "New password must be at least 8 characters." };
  }

  const rows = (await sqlClient.query(
    "SELECT password_salt, password_hash FROM player_credentials WHERE player_id = $1",
    [playerId],
  )) as unknown as Array<{ password_salt: string; password_hash: string }>;

  if (rows.length > 0) {
    if (!currentPassword) {
      return { ok: false, message: "Enter your current password." };
    }
    if (!verifyPassword(currentPassword, rows[0].password_salt, rows[0].password_hash)) {
      return { ok: false, message: "Current password is incorrect." };
    }
  }

  await setPlayerPassword(playerId, newPassword);
  return { ok: true, message: "Password updated successfully." };
}
