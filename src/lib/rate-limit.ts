import "server-only";
import { sqlClient } from "./db";

/**
 * Lightweight fixed-window rate limiter backed by Postgres so it works across
 * serverless instances (an in-memory counter would reset per cold start and
 * per instance). Each call atomically increments a per-bucket counter for the
 * current time window; once the window rolls over, a fresh row is used.
 *
 * The backing table is created lazily (idempotent `CREATE TABLE IF NOT EXISTS`)
 * so no separate migration step is required to start protecting auth flows.
 */

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = sqlClient
      .query(
        `CREATE TABLE IF NOT EXISTS rate_limits (
           bucket       TEXT        NOT NULL,
           window_start TIMESTAMPTZ NOT NULL,
           count        INTEGER     NOT NULL DEFAULT 0,
           PRIMARY KEY (bucket, window_start)
         )`,
      )
      .then(() => undefined)
      .catch((err) => {
        // Reset so a later call can retry provisioning.
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

export interface RateLimitResult {
  /** True when the attempt is within the allowed budget for the window. */
  allowed: boolean;
  /** Remaining attempts in the current window (never negative). */
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfterSeconds: number;
}

/**
 * Record an attempt for `key` and report whether it is allowed. Permits up to
 * `limit` attempts per `windowSec` seconds. Fails open (allows the request) if
 * the limiter store is unreachable, so a database hiccup never locks users out.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  try {
    await ensureTable();

    const bucketMs = windowSec * 1000;
    const windowStart = new Date(Math.floor(Date.now() / bucketMs) * bucketMs);

    const rows = (await sqlClient.query(
      `INSERT INTO rate_limits (bucket, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [key, windowStart.toISOString()],
    )) as unknown as Array<{ count: number }>;

    const count = Number(rows[0]?.count ?? 1);
    const nextWindowMs = windowStart.getTime() + bucketMs;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((nextWindowMs - Date.now()) / 1000)),
    };
  } catch {
    // Fail open — never block legitimate users because the limiter is down.
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}
