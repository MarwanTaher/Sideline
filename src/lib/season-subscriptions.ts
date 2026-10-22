import "server-only";
import { sqlClient } from "./db";
import { setPlayerAvailability } from "./availability";
import { notify } from "./push";
import { logAppError } from "./error-log";

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
  /** Players only see the season once an admin releases it. */
  visibleToPlayers: boolean;
};

export type SeasonWaitlistPlayer = {
  playerId: number;
  name: string;
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
  visible_to_players: boolean;
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
    visibleToPlayers: Boolean(r.visible_to_players),
  };
}

const SEASON_COLUMNS = `id, name, start_date, end_date, subscription_enabled,
                        subscriber_cap, terms, terms_version, signup_open,
                        visible_to_players`;

/**
 * The subscription season a match belongs to.
 *
 * Membership is explicit (`matches.season_id`), not inferred from the date: an
 * admin may run an ordinary one-off game during the contract period, and it
 * must not drag in auto-IN, session charges or the fund.
 */
export async function getSubscriptionSeasonForMatch(
  matchId: number,
): Promise<SubscriptionSeason | null> {
  const rows = (await sqlClient.query(
    `SELECT ${SEASON_COLUMNS}
       FROM seasons
      WHERE id = (SELECT season_id FROM matches WHERE id = $1)
        AND subscription_enabled = true`,
    [matchId],
  )) as SeasonRow[];
  return rows.length > 0 ? toSeason(rows[0]) : null;
}

/** The subscription season covering a date, for defaulting the match form. */
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
    visibleToPlayers: boolean;
    bumpTermsVersion: boolean;
  },
): Promise<void> {
  const updated = await sqlClient.query(
    `UPDATE seasons
        SET subscription_enabled = $1,
            subscriber_cap = $2,
            terms = $3,
            signup_open = $4,
            visible_to_players = $7,
            terms_version = terms_version + $5,
            terms_final_at = CASE
              WHEN terms IS DISTINCT FROM $3 THEN NULL
              ELSE terms_final_at
            END
      WHERE id = $6
        AND (
          NOT $7 OR visible_to_players OR (
            length(btrim(payment_name)) > 0 AND length(btrim(payment_account)) > 0
            AND day_rate_minor > 0 AND payment_due_day BETWEEN 1 AND 28
            AND rates_confirmed_at IS NOT NULL
            AND terms = $3 AND length(btrim(terms)) > 0 AND terms_final_at IS NOT NULL
            AND test_invoice_completed_at IS NOT NULL AND reminder_text_reviewed_at IS NOT NULL
          )
        )
      RETURNING id`,
    [
      input.subscriptionEnabled,
      input.subscriberCap,
      input.terms,
      input.signupOpen,
      input.bumpTermsVersion ? 1 : 0,
      seasonId,
      input.visibleToPlayers,
    ],
  );
  if (updated.length === 0) {
    throw new Error("Season not found or the go-live checklist is incomplete. Save changed terms while hidden first.");
  }
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
  const rows = (await sqlClient.query(
    `SELECT ss.player_id, ss.status, ss.accepted_at, ss.accepted_terms_version,
            p.name, p.photo_url
       FROM season_subscriptions ss
       JOIN players p ON p.id = ss.player_id
      WHERE ss.season_id = $1 AND ss.player_id = $2`,
    [seasonId, playerId],
  )) as Array<{
    player_id: number;
    status: string;
    accepted_at: string | Date;
    accepted_terms_version: number;
    name: string;
    photo_url: string | null;
  }>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    playerId: Number(r.player_id),
    name: String(r.name),
    photoUrl: r.photo_url ?? null,
    status: r.status === "withdrawn" ? "withdrawn" : "active",
    acceptedAt:
      r.accepted_at instanceof Date ? r.accepted_at.toISOString() : String(r.accepted_at),
    acceptedTermsVersion: Number(r.accepted_terms_version),
  };
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

      await removeSeasonWaitlistPlayer(seasonId, playerId);
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
  const withdrawn = (await sqlClient.query(
    `UPDATE season_subscriptions
        SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP
      WHERE season_id = $1 AND player_id = $2 AND status = 'active'
      RETURNING player_id`,
    [seasonId, playerId],
  )) as Array<{ player_id: number }>;
  if (withdrawn.length > 0) {
    try {
      await offerNextSeasonWaitlistPlayer(seasonId);
    } catch (err) {
      await logAppError(err, "season.waitlist-offer");
    }
  }
}

const SEASON_WAITLIST_PREFIX = "season_waitlist_";
const SEASON_WAITLIST_OFFER_PREFIX = "season_waitlist_offer_";

async function seasonWaitlistIds(seasonId: number): Promise<number[]> {
  const rows = (await sqlClient.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [`${SEASON_WAITLIST_PREFIX}${seasonId}`],
  )) as Array<{ value: string | null }>;
  return (rows[0]?.value ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function joinSeasonWaitlist(seasonId: number, playerId: number): Promise<number> {
  const season = await getSubscriptionSeason(seasonId);
  if (!season?.subscriptionEnabled || !season.visibleToPlayers) {
    throw new Error("Season sign-up is not available.");
  }
  const subscription = await getSubscription(seasonId, playerId);
  if (subscription?.status === "active") throw new Error("You already hold a season place.");

  const rows = await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = CASE
       WHEN $2 = ANY(string_to_array(app_settings.value, ',')) THEN app_settings.value
       ELSE concat_ws(',', NULLIF(app_settings.value, ''), $2)
     END
     RETURNING value`,
    [`${SEASON_WAITLIST_PREFIX}${seasonId}`, String(playerId)],
  );
  return String(rows[0].value).split(",").indexOf(String(playerId)) + 1;
}

export async function removeSeasonWaitlistPlayer(
  seasonId: number,
  playerId: number,
): Promise<void> {
  await sqlClient.query(
    `UPDATE app_settings
        SET value = array_to_string(array_remove(string_to_array(value, ','), $2), ',')
      WHERE key = $1`,
    [`${SEASON_WAITLIST_PREFIX}${seasonId}`, String(playerId)],
  );
  await sqlClient.query(
    `DELETE FROM app_settings WHERE key = $1 AND value = $2`,
    [`${SEASON_WAITLIST_OFFER_PREFIX}${seasonId}`, String(playerId)],
  );
}

export async function listSeasonWaitlist(
  seasonId: number,
): Promise<SeasonWaitlistPlayer[]> {
  const ids = await seasonWaitlistIds(seasonId);
  if (ids.length === 0) return [];
  const rows = (await sqlClient.query(
    `SELECT id, name FROM players WHERE id = ANY($1::int[])`,
    [ids],
  )) as Array<{ id: number; name: string }>;
  const byId = new Map(rows.map((row) => [Number(row.id), String(row.name)]));
  return ids
    .filter((id) => byId.has(id))
    .map((playerId) => ({ playerId, name: byId.get(playerId) as string }));
}

export async function getSeasonWaitlistPosition(
  seasonId: number,
  playerId: number,
): Promise<number | null> {
  const index = (await seasonWaitlistIds(seasonId)).indexOf(playerId);
  return index < 0 ? null : index + 1;
}

/** Send one targeted offer when a committed player frees a core seat. */
export async function offerNextSeasonWaitlistPlayer(seasonId: number): Promise<number | null> {
  const season = await getSubscriptionSeason(seasonId);
  if (!season) return null;
  const activeCount = await countActiveSubscribers(seasonId);
  if (activeCount >= season.subscriberCap) return null;

  const queued = await seasonWaitlistIds(seasonId);
  if (queued.length === 0) return null;
  const candidates = (await sqlClient.query(
    `SELECT q.player_id
       FROM unnest($2::int[]) WITH ORDINALITY AS q(player_id, position)
       LEFT JOIN season_subscriptions ss
         ON ss.season_id = $1 AND ss.player_id = q.player_id AND ss.status = 'active'
      WHERE ss.player_id IS NULL
      ORDER BY q.position
      LIMIT 1`,
    [seasonId, queued],
  )) as Array<{ player_id: number }>;
  const playerId = candidates[0] ? Number(candidates[0].player_id) : null;
  if (playerId == null) return null;

  const claimed = (await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
    [`${SEASON_WAITLIST_OFFER_PREFIX}${seasonId}`, String(playerId)],
  )) as Array<{ key: string }>;
  if (claimed.length === 0) return null;

  await notify(
    "waitlist_promoted",
    {
      title: "A season place is available",
      body: `A core place opened in ${season.name}. Review the rules and accept your place on the season page.`,
      url: "/season",
      tag: `season-waitlist-${seasonId}-${playerId}`,
    },
    { playerIds: [playerId] },
  );
  return playerId;
}

/** Match ids explicitly assigned to a season that have not kicked off yet. */
async function upcomingSeasonMatchIds(seasonId: number): Promise<number[]> {
  const rows = (await sqlClient.query(
    `SELECT id FROM matches
      WHERE season_id = $1
        AND (kickoff_at IS NULL OR kickoff_at > NOW())
        AND COALESCE(matchday_status, 'draft') <> 'closed'`,
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
  const season = await getSubscriptionSeasonForMatch(matchId);
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
  const season = await getSubscriptionSeasonForMatch(matchId);
  if (!season) return new Set();

  const subs = await listSubscribers(season.id);
  return new Set(subs.map((s) => s.playerId));
}
