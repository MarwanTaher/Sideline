import "server-only";
import webpush from "web-push";
import { sqlClient } from "./db";

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

/** Send a notification to every subscription belonging to the given players. */
export async function sendPushToPlayers(
  playerIds: number[],
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured() || playerIds.length === 0) return;
  if (!(await isPushEnabled())) return;

  const raw = (await sqlClient.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE player_id = ANY($1)`,
    [playerIds],
  )) as Row[];

  await dispatch(await rowsToSubscriptions(raw), payload);
}

/** Send a notification to all stored subscriptions. */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  if (!(await isPushEnabled())) return;

  const raw = (await sqlClient.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions`,
  )) as Row[];

  await dispatch(await rowsToSubscriptions(raw), payload);
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
