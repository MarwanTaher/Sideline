import "server-only";
import { sqlClient } from "./db";
import { setPlayerAvailability } from "./availability";

/**
 * Season subscriptions — the winter 2026/2027 contract model.
 *
 * A fixed core group commits for the whole season and is marked IN
 * automatically for every match inside the contract window. Places are first
 * come, first served on `accepted_at`, capped per season.
 *
 * Accepting the terms secures a place; payment is confirmed separately, so a
 * subscription here means "committed", not "paid".
 */

export type SubscriptionStatus = "active" | "withdrawn";

export type SeasonSubscription = {
  playerId: number;
  name: string;
  photoUrl: string | null;
  status: SubscriptionStatus;
  acceptedAt: string;
  acceptedTermsVersion: number;
};

export type SubscriptionSeason = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  subscriptionEnabled: boolean;
  subscriberCap: number;
  terms: string;
  termsVersion: number;
  signupOpen: boolean;
};

type SeasonRow = {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  subscription_enabled: boolean;
  subscriber_cap: number;
  terms: string;
  terms_version: number;
  signup_open: boolean;
};

function toSeason(r: SeasonRow): SubscriptionSeason {
  return {
    id: Number(r.id),
    name: String(r.name),
    startDate: String(r.start_date),
    endDate: r.end_date == null ? null : String(r.end_date),
    subscriptionEnabled: Boolean(r.subscription_enabled),
    subscriberCap: Number(r.subscriber_cap),
    terms: String(r.terms ?? ""),
    termsVersion: Number(r.terms_version),
    signupOpen: Boolean(r.signup_open),
  };
}

const SEASON_COLUMNS = `id, name, start_date, end_date, subscription_enabled,
                        subscriber_cap, terms, terms_version, signup_open`;

/** The subscription season a date falls inside, if any. */
export async function getSubscriptionSeasonForDate(
  playedOn: string,
): Promise<SubscriptionSeason | null> {
  const rows = (await sqlClient.query(
    `SELECT ${SEASON_COLUMNS} FROM seasons
      WHERE subscription_enabled = true
        AND status = 'active'
        AND start_date <= $1
        AND (end_date IS NULL OR end_date >= $1)
      ORDER BY start_date DESC
      LIMIT 1`,
    [playedOn],
  )) as SeasonRow[];
  return rows.length > 0 ? toSeason(rows[0]) : null;
}

/** The subscription season currently open for sign-up or under way. */
export async function getActiveSubscriptionSeason(): Promise<SubscriptionSeason | null> {
  const rows = (await sqlClient.query(
    `SELECT ${SEASON_COLUMNS} FROM seasons
      WHERE subscription_enabled = true AND status = 'active'
      ORDER BY start_date DESC
      LIMIT 1`,
  )) as SeasonRow[];
  return rows.length > 0 ? toSeason(rows[0]) : null;
}

export async function getSubscriptionSeason(
  seasonId: number,
): Promise<SubscriptionSeason | null> {
  const rows = (await sqlClient.query(
    `SELECT ${SEASON_COLUMNS} FROM seasons WHERE id = $1`,
    [seasonId],
  )) as SeasonRow[];
  return rows.length > 0 ? toSeason(rows[0]) : null;
}

export async function updateSeasonSubscriptionSettings(
  seasonId: number,
  input: {
    subscriptionEnabled: boolean;
    subscriberCap: number;
    terms: string;
    signupOpen: boolean;
    bumpTermsVersion: boolean;
  },
): Promise<void> {
  await sqlClient.query(
    `UPDATE seasons
        SET subscription_enabled = $1,
            subscriber_cap = $2,
            terms = $3,
            signup_open = $4,
            terms_version = terms_version + $5
      WHERE id = $6`,
    [
      input.subscriptionEnabled,
      input.subscriberCap,
      input.terms,
      input.signupOpen,
      input.bumpTermsVersion ? 1 : 0,
      seasonId,
    ],
  );
}

/** Core subscribers in the order they committed. */
export async function listSubscribers(
  seasonId: number,
  opts: { includeWithdrawn?: boolean } = {},
): Promise<SeasonSubscription[]> {
  const rows = (await sqlClient.query(
    `SELECT ss.player_id, ss.status, ss.accepted_at, ss.accepted_terms_version,
            p.name, p.photo_url
       FROM season_subscriptions ss
       JOIN players p ON p.id = ss.player_id
      WHERE ss.season_id = $1
        AND ($2 OR ss.status = 'active')
      ORDER BY ss.accepted_at ASC, ss.id ASC`,
    [seasonId, opts.includeWithdrawn ?? false],
  )) as Array<{
    player_id: number;
    status: string;
    accepted_at: string | Date;
    accepted_terms_version: number;
    name: string;
    photo_url: string | null;
  }>;

  return rows.map((r) => ({
    playerId: Number(r.player_id),
    name: String(r.name),
    photoUrl: r.photo_url ?? null,
    status: r.status === "withdrawn" ? "withdrawn" : "active",
    acceptedAt:
      r.accepted_at instanceof Date ? r.accepted_at.toISOString() : String(r.accepted_at),
    acceptedTermsVersion: Number(r.accepted_terms_version),
  }));
}

export async function countActiveSubscribers(seasonId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT COUNT(*)::int AS n FROM season_subscriptions
      WHERE season_id = $1 AND status = 'active'`,
    [seasonId],
  )) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

export async function getSubscription(
  seasonId: number,
  playerId: number,
): Promise<SeasonSubscription | null> {
  const all = await listSubscribers(seasonId, { includeWithdrawn: true });
  return all.find((s) => s.playerId === playerId) ?? null;
}

export type SubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; reason: "closed" | "full" | "not_enabled" };

/**
 * Take one of the core places.
 *
 * Seats are numbered and uniquely indexed per season, so the cap survives a
 * simultaneous rush: two players racing for the same seat means one hits the
 * unique index, and the retry picks up the next free seat (or finds none left).
 * A plain COUNT(*) check cannot do this on READ COMMITTED — both statements
 * would see the same pre-insert count.
 */
export async function subscribePlayer(
  seasonId: number,
  playerId: number,
  termsVersion: number,
): Promise<SubscribeResult> {
  const season = await getSubscriptionSeason(seasonId);
  if (!season || !season.subscriptionEnabled) return { ok: false, reason: "not_enabled" };
  if (!season.signupOpen) return { ok: false, reason: "closed" };

  const existing = await getSubscription(seasonId, playerId);
  if (existing?.status === "active") return { ok: true, alreadySubscribed: true };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const inserted = (await sqlClient.query(
        `INSERT INTO season_subscriptions
           (season_id, player_id, status, accepted_terms_version, accepted_at, seat_no)
         SELECT $1, $2, 'active', $3, CURRENT_TIMESTAMP, free.seat
           FROM (
             SELECT gs AS seat
               FROM generate_series(1, $4) AS gs
              WHERE NOT EXISTS (
                SELECT 1 FROM season_subscriptions
                 WHERE season_id = $1 AND status = 'active' AND seat_no = gs
              )
              ORDER BY gs
              LIMIT 1
           ) AS free
         ON CONFLICT (season_id, player_id) DO UPDATE
            SET status = 'active',
                accepted_terms_version = EXCLUDED.accepted_terms_version,
                accepted_at = CURRENT_TIMESTAMP,
                withdrawn_at = NULL,
                seat_no = EXCLUDED.seat_no
         RETURNING id`,
        [seasonId, playerId, termsVersion, season.subscriberCap],
      )) as Array<{ id: number }>;

      // No row means generate_series found no free seat: the group is full.
      if (inserted.length === 0) return { ok: false, reason: "full" };

      await applySubscriberToUpcomingMatches(seasonId, playerId);
      return { ok: true, alreadySubscribed: false };
    } catch (err) {
      // Someone else took the seat between the SELECT and the INSERT.
      if (!isUniqueViolation(err)) throw err;
    }
  }

  return { ok: false, reason: "full" };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

/** Give up a core place. Billing already incurred is unaffected. */
export async function withdrawPlayer(
  seasonId: number,
  playerId: number,
): Promise<void> {
  await sqlClient.query(
    `UPDATE season_subscriptions
        SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP
      WHERE season_id = $1 AND player_id = $2`,
    [seasonId, playerId],
  );
}

/** Match ids inside a season that have not kicked off yet. */
async function upcomingSeasonMatchIds(seasonId: number): Promise<number[]> {
  const rows = (await sqlClient.query(
    `SELECT m.id
       FROM matches m
       JOIN seasons s ON s.id = $1
      WHERE m.played_on >= s.start_date
        AND (s.end_date IS NULL OR m.played_on <= s.end_date)
        AND (m.kickoff_at IS NULL OR m.kickoff_at > NOW())
        AND COALESCE(m.matchday_status, 'draft') <> 'closed'`,
    [seasonId],
  )) as Array<{ id: number }>;
  return rows.map((r) => Number(r.id));
}

/**
 * Mark one subscriber IN for every upcoming match of the season. Only fills a
 * blank response — someone who already said OUT keeps that choice.
 */
export async function applySubscriberToUpcomingMatches(
  seasonId: number,
  playerId: number,
): Promise<number> {
  const matchIds = await upcomingSeasonMatchIds(seasonId);
  let applied = 0;
  for (const matchId of matchIds) {
    const rows = (await sqlClient.query(
      `SELECT status FROM match_availability WHERE match_id = $1 AND player_id = $2`,
      [matchId, playerId],
    )) as Array<{ status: string }>;
    if (rows.length > 0) continue;
    await setPlayerAvailability(matchId, playerId, "in");
    applied += 1;
  }
  return applied;
}

/**
 * Mark every core subscriber IN for a match. Called when a match inside a
 * subscription window is created, and available to admins as a re-sync.
 * Existing answers are never overwritten.
 */
export async function applySubscribersToMatch(matchId: number): Promise<number> {
  const metaRows = (await sqlClient.query(
    `SELECT played_on FROM matches WHERE id = $1`,
    [matchId],
  )) as Array<{ played_on: string | null }>;
  const playedOn = metaRows[0]?.played_on;
  if (!playedOn) return 0;

  const season = await getSubscriptionSeasonForDate(String(playedOn));
  if (!season) return 0;

  const subscribers = await listSubscribers(season.id);
  if (subscribers.length === 0) return 0;

  const answered = (await sqlClient.query(
    `SELECT player_id FROM match_availability WHERE match_id = $1`,
    [matchId],
  )) as Array<{ player_id: number }>;
  const alreadyAnswered = new Set(answered.map((r) => Number(r.player_id)));

  let applied = 0;
  for (const sub of subscribers) {
    if (alreadyAnswered.has(sub.playerId)) continue;
    await setPlayerAvailability(matchId, sub.playerId, "in");
    applied += 1;
  }
  return applied;
}

/** Player ids committed for the season a match belongs to. */
export async function getSubscriberIdsForMatch(matchId: number): Promise<Set<number>> {
  const metaRows = (await sqlClient.query(
    `SELECT played_on FROM matches WHERE id = $1`,
    [matchId],
  )) as Array<{ played_on: string | null }>;
  const playedOn = metaRows[0]?.played_on;
  if (!playedOn) return new Set();

  const season = await getSubscriptionSeasonForDate(String(playedOn));
  if (!season) return new Set();

  const subs = await listSubscribers(season.id);
  return new Set(subs.map((s) => s.playerId));
}
