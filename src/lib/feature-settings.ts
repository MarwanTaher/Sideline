import "server-only";
import { sqlClient } from "./db";

/**
 * Admin-controlled feature switches, stored in `app_settings`. These gate the
 * behaviours that genuinely need an on/off control (auto-approving trusted
 * players' stats, waitlist auto-promotion) rather than blanket-gating every
 * improvement. All default OFF so nothing changes until an admin opts in.
 */

const AUTO_APPROVE_TRUSTED_KEY = "stats_auto_approve_trusted";
const TRUSTED_PLAYER_IDS_KEY = "stats_trusted_player_ids";
const WAITLIST_AUTO_PROMOTE_KEY = "waitlist_auto_promote";
const WAITLIST_VISIBLE_KEY = "waitlist_visible_to_players";
const AVAILABILITY_VOTE_GATE_KEY = "availability_vote_gate";
const AVAILABILITY_LOCK_24H_KEY = "availability_lock_24h";

export async function getSetting(key: string): Promise<string | null> {
  const rows = (await sqlClient.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [key],
  )) as Array<{ value: string | null }>;
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

// ── Trusted-player stat auto-approval (#8) ─────────────────────────────────

export async function isAutoApproveTrustedEnabled(): Promise<boolean> {
  return (await getSetting(AUTO_APPROVE_TRUSTED_KEY)) === "1";
}

export async function setAutoApproveTrusted(enabled: boolean): Promise<void> {
  await setSetting(AUTO_APPROVE_TRUSTED_KEY, enabled ? "1" : "0");
}

export async function getTrustedPlayerIds(): Promise<number[]> {
  const raw = await getSetting(TRUSTED_PLAYER_IDS_KEY);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export async function setTrustedPlayerIds(ids: number[]): Promise<void> {
  const clean = Array.from(
    new Set(ids.filter((n) => Number.isInteger(n) && n > 0)),
  ).sort((a, b) => a - b);
  await setSetting(TRUSTED_PLAYER_IDS_KEY, clean.join(","));
}

export async function isPlayerTrusted(playerId: number): Promise<boolean> {
  const ids = await getTrustedPlayerIds();
  return ids.includes(playerId);
}

// ── Availability waitlist auto-promotion (#9) ──────────────────────────────

export async function isWaitlistAutoPromoteEnabled(): Promise<boolean> {
  return (await getSetting(WAITLIST_AUTO_PROMOTE_KEY)) === "1";
}

export async function setWaitlistAutoPromote(enabled: boolean): Promise<void> {
  await setSetting(WAITLIST_AUTO_PROMOTE_KEY, enabled ? "1" : "0");
}

// ── Waitlist visibility to players ─────────────────────────────────────────
// When on, non-admin players see the ordered waitlist on the availability page.

export async function isWaitlistVisibleToPlayers(): Promise<boolean> {
  return (await getSetting(WAITLIST_VISIBLE_KEY)) === "1";
}

export async function setWaitlistVisibleToPlayers(enabled: boolean): Promise<void> {
  await setSetting(WAITLIST_VISIBLE_KEY, enabled ? "1" : "0");
}

// ── Availability vote-gate ─────────────────────────────────────────────────
// When on, a player who was in their last game but hasn't rated anyone yet is
// blocked from marking IN for a new match until they vote. Default OFF.

export async function isVoteGateEnabled(): Promise<boolean> {
  return (await getSetting(AVAILABILITY_VOTE_GATE_KEY)) === "1";
}

export async function setVoteGate(enabled: boolean): Promise<void> {
  await setSetting(AVAILABILITY_VOTE_GATE_KEY, enabled ? "1" : "0");
}

// ── Availability lock 24h before kickoff ─────────────────────────────────
// When on, players cannot change their own availability within 24 hours of
// kickoff — they are told to contact an admin. Admin overrides are unaffected.

export async function isAvailabilityLockEnabled(): Promise<boolean> {
  return (await getSetting(AVAILABILITY_LOCK_24H_KEY)) === "1";
}

export async function setAvailabilityLock(enabled: boolean): Promise<void> {
  await setSetting(AVAILABILITY_LOCK_24H_KEY, enabled ? "1" : "0");
}

/** Availability "nudge the no-replies" push: last-sent timestamp per match. */
export const NUDGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function nudgeKey(matchId: number): string {
  return `nudge:${matchId}`;
}

export async function getLastNudgeAt(matchId: number): Promise<number | null> {
  const v = Number((await getSetting(nudgeKey(matchId))) ?? 0);
  return v > 0 ? v : null;
}
