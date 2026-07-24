import "server-only";
import webpush from "web-push";
import { sqlClient } from "./db";
import {
  NOTIFICATION_TYPES,
  getNotificationType,
  typeEnabledSettingKey,
  typeAudienceSettingKey,
  type AudienceMode,
  type NotificationType,
  type NotificationTypeKey,
} from "./notification-types";

let configured = false;

/**
 * Lazily configure web-push with the VAPID credentials. Returns false when the
 * keys are missing so callers can no-op instead of throwing in environments
 * where push is not set up.
 */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@sideline.app";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Global on/off switch for push, stored in app_settings under `push_enabled`.
 * Defaults to enabled when the row is absent.
 */
export async function isPushEnabled(): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT value FROM app_settings WHERE key = 'push_enabled'`,
  )) as Array<{ value: string | null }>;
  if (rows.length === 0) return true;
  return rows[0].value !== "0";
}

export async function setPushEnabled(enabled: boolean): Promise<void> {
  await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ('push_enabled', $1)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [enabled ? "1" : "0"],
  );
}


export type SavedSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Store (or refresh) a browser push subscription for a player. */
export async function saveSubscription(
  playerId: number | null,
  sub: SavedSubscription,
  userAgent = "",
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint)
     DO UPDATE SET player_id = EXCLUDED.player_id,
                   p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth,
                   user_agent = EXCLUDED.user_agent`,
    [playerId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent],
  );
}

/** Remove a subscription by its endpoint (e.g. on unsubscribe). */
export async function deleteSubscription(endpoint: string): Promise<void> {
  await sqlClient.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [
    endpoint,
  ]);
}

type Row = { endpoint: string; p256dh: string; auth: string };

async function rowsToSubscriptions(rows: Row[]): Promise<
  { endpoint: string; keys: { p256dh: string; auth: string } }[]
> {
  return rows.map((r) => ({
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth },
  }));
}

async function queryAllSubs(): Promise<Row[]> {
  return (await sqlClient.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions`,
  )) as Row[];
}

async function queryPlayerSubs(playerIds: number[]): Promise<Row[]> {
  return (await sqlClient.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE player_id = ANY($1)`,
    [playerIds],
  )) as Row[];
}

async function queryAdminSubs(): Promise<Row[]> {
  return (await sqlClient.query(
    `SELECT s.endpoint, s.p256dh, s.auth
       FROM push_subscriptions s
       JOIN admins a ON a.player_id = s.player_id AND a.active = 1`,
  )) as Row[];
}

/** All subscriptions, excluding players who opted out of `typeKey`. */
async function queryAllSubsRespectingPrefs(typeKey: string): Promise<Row[]> {
  return (await sqlClient.query(
    `SELECT s.endpoint, s.p256dh, s.auth
       FROM push_subscriptions s
      WHERE s.player_id IS NULL
         OR NOT EXISTS (
              SELECT 1 FROM push_preferences p
               WHERE p.player_id = s.player_id
                 AND p.type_key = $1
                 AND p.enabled = 0
            )`,
    [typeKey],
  )) as Row[];
}

/** Subscriptions for the given players, excluding those who opted out. */
async function queryPlayerSubsRespectingPrefs(
  playerIds: number[],
  typeKey: string,
): Promise<Row[]> {
  return (await sqlClient.query(
    `SELECT s.endpoint, s.p256dh, s.auth
       FROM push_subscriptions s
      WHERE s.player_id = ANY($1)
        AND NOT EXISTS (
              SELECT 1 FROM push_preferences p
               WHERE p.player_id = s.player_id
                 AND p.type_key = $2
                 AND p.enabled = 0
            )`,
    [playerIds, typeKey],
  )) as Row[];
}

// ---------------------------------------------------------------------------
// Per-type configuration & the notify() dispatcher
// ---------------------------------------------------------------------------

export type NotificationTypeStatus = NotificationType & {
  enabled: boolean;
  audienceMode: AudienceMode;
};

/** Read the enabled flag + audience mode for every notification type. */
export async function getNotificationTypeStatuses(): Promise<
  NotificationTypeStatus[]
> {
  const keys: string[] = [];
  for (const t of NOTIFICATION_TYPES) {
    keys.push(typeEnabledSettingKey(t.key), typeAudienceSettingKey(t.key));
  }
  const rows = (await sqlClient.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [keys],
  )) as Array<{ key: string; value: string | null }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return NOTIFICATION_TYPES.map((t) => {
    const enabledVal = map.get(typeEnabledSettingKey(t.key));
    const audienceVal = map.get(typeAudienceSettingKey(t.key));
    return {
      ...t,
      enabled: enabledVal == null ? t.defaultEnabled : enabledVal !== "0",
      audienceMode: audienceVal === "admins" ? "admins" : "default",
    };
  });
}

export async function setNotificationTypeEnabled(
  key: NotificationTypeKey,
  enabled: boolean,
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [typeEnabledSettingKey(key), enabled ? "1" : "0"],
  );
}

export async function setNotificationTypeAudience(
  key: NotificationTypeKey,
  mode: AudienceMode,
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [typeAudienceSettingKey(key), mode],
  );
}

async function getTypeConfig(
  key: NotificationTypeKey,
): Promise<{ enabled: boolean; audienceMode: AudienceMode }> {
  const type = getNotificationType(key);
  const rows = (await sqlClient.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [[typeEnabledSettingKey(key), typeAudienceSettingKey(key)]],
  )) as Array<{ key: string; value: string | null }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabledVal = map.get(typeEnabledSettingKey(key));
  const audienceVal = map.get(typeAudienceSettingKey(key));
  return {
    enabled:
      enabledVal == null ? (type?.defaultEnabled ?? true) : enabledVal !== "0",
    audienceMode: audienceVal === "admins" ? "admins" : "default",
  };
}

/**
 * Send a typed notification. Respects the global push switch, the per-type
 * enabled flag, and the per-type audience mode (an admin may force a type to
 * admin devices only). For types whose natural audience is a specific set of
 * players, pass `opts.playerIds`.
 */
export async function notify(
  typeKey: NotificationTypeKey,
  payload: PushPayload,
  opts: { playerIds?: number[] } = {},
): Promise<void> {
  if (!ensureConfigured()) return;
  if (!(await isPushEnabled())) return;

  const type = getNotificationType(typeKey);
  if (!type) return;

  const cfg = await getTypeConfig(typeKey);
  if (!cfg.enabled) return;

  const effectiveAudience =
    type.audienceOverridable && cfg.audienceMode === "admins"
      ? "admins"
      : type.audience;

  let raw: Row[];
  if (effectiveAudience === "admins") {
    raw = await queryAdminSubs();
  } else if (effectiveAudience === "all") {
    raw = type.userConfigurable
      ? await queryAllSubsRespectingPrefs(typeKey)
      : await queryAllSubs();
  } else {
    const ids = opts.playerIds ?? [];
    if (ids.length === 0) return;
    raw = type.userConfigurable
      ? await queryPlayerSubsRespectingPrefs(ids, typeKey)
      : await queryPlayerSubs(ids);
  }

  await dispatch(await rowsToSubscriptions(raw), payload);
}

// ---------------------------------------------------------------------------
// Per-user preferences & device management
// ---------------------------------------------------------------------------

export async function setPlayerPreference(
  playerId: number,
  typeKey: NotificationTypeKey,
  enabled: boolean,
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO push_preferences(player_id, type_key, enabled, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (player_id, type_key)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = CURRENT_TIMESTAMP`,
    [playerId, typeKey, enabled ? 1 : 0],
  );
}

export type PlayerDevice = {
  id: number;
  userAgent: string;
  createdAt: string;
  endpoint: string;
};

/** List a player's registered push devices, newest first. */
export async function getPlayerDevices(
  playerId: number,
): Promise<PlayerDevice[]> {
  const rows = (await sqlClient.query(
    `SELECT id, user_agent, created_at, endpoint
       FROM push_subscriptions
      WHERE player_id = $1
      ORDER BY created_at DESC`,
    [playerId],
  )) as Array<{
    id: number;
    user_agent: string;
    created_at: string;
    endpoint: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    createdAt: String(r.created_at),
    endpoint: r.endpoint,
  }));
}

/** Remove one of a player's devices (scoped to that player for safety). */
export async function deletePlayerDevice(
  playerId: number,
  endpoint: string,
): Promise<void> {
  await sqlClient.query(
    `DELETE FROM push_subscriptions WHERE player_id = $1 AND endpoint = $2`,
    [playerId, endpoint],
  );
}

// ---------------------------------------------------------------------------
// Admin per-user overview
// ---------------------------------------------------------------------------

export type PlayerNotificationRow = {
  playerId: number;
  name: string;
  devices: PlayerDevice[];
  /** Per-type enabled state (only present for types with an explicit row). */
  prefs: Record<string, boolean>;
};

/**
 * Admin view: every active player with their subscribed devices and per-type
 * notification preferences. Types without a stored row default to enabled.
 */
export async function getPlayersNotificationMatrix(): Promise<
  PlayerNotificationRow[]
> {
  const playerRows = (await sqlClient.query(
    `SELECT id, name FROM players WHERE active = 1 ORDER BY name`,
  )) as Array<{ id: number; name: string }>;

  const prefRows = (await sqlClient.query(
    `SELECT player_id, type_key, enabled FROM push_preferences`,
  )) as Array<{ player_id: number; type_key: string; enabled: number }>;

  const deviceRows = (await sqlClient.query(
    `SELECT id, player_id, user_agent, created_at, endpoint
       FROM push_subscriptions
      WHERE player_id IS NOT NULL
      ORDER BY created_at DESC`,
  )) as Array<{
    id: number;
    player_id: number;
    user_agent: string;
    created_at: string;
    endpoint: string;
  }>;

  const prefsByPlayer = new Map<number, Record<string, boolean>>();
  for (const r of prefRows) {
    const pid = Number(r.player_id);
    const m = prefsByPlayer.get(pid) ?? {};
    m[r.type_key] = r.enabled !== 0;
    prefsByPlayer.set(pid, m);
  }

  const devicesByPlayer = new Map<number, PlayerDevice[]>();
  for (const r of deviceRows) {
    const pid = Number(r.player_id);
    const arr = devicesByPlayer.get(pid) ?? [];
    arr.push({
      id: r.id,
      userAgent: r.user_agent,
      createdAt: String(r.created_at),
      endpoint: r.endpoint,
    });
    devicesByPlayer.set(pid, arr);
  }

  return playerRows.map((p) => {
    const pid = Number(p.id);
    return {
      playerId: pid,
      name: p.name,
      devices: devicesByPlayer.get(pid) ?? [],
      prefs: prefsByPlayer.get(pid) ?? {},
    };
  });
}

async function dispatch(
  subs: { endpoint: string; keys: { p256dh: string; auth: string } }[],
  payload: PushPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body);
      } catch (err: unknown) {
        const status =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404/410 mean the subscription is gone — prune it.
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await sqlClient.query(
      `DELETE FROM push_subscriptions WHERE endpoint = ANY($1)`,
      [stale],
    );
  }
}
