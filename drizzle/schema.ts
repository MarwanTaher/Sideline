import { pgTable, index, uniqueIndex, check, integer, bigint, text, doublePrecision, timestamp, unique, foreignKey, primaryKey, boolean, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const matches = pgTable("matches", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "matches_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	playedOn: text("played_on").notNull(),
	numTeams: integer("num_teams").notNull(),
	teamSize: integer("team_size").notNull(),
	totalPayment: doublePrecision("total_payment").default(0).notNull(),
	statsScoringEnabled: integer("stats_scoring_enabled").default(1).notNull(),
	status: text().default('open').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	paymentName: text("payment_name").default("").notNull(),
	paymentMobile: text("payment_mobile").default("").notNull(),
	paymentMethod: text("payment_method").default("").notNull(),
	paymentNote: text("payment_note").default("").notNull(),
	matchdayStatus: text("matchday_status").default('draft').notNull(),
	matchTime: text("match_time").default("").notNull(),
	maxPlayers: integer("max_players").default(18).notNull(),
	availabilityOpen: integer("availability_open").default(1).notNull(),
	paymentsActive: integer("payments_active").default(0).notNull(),
	teamNames: text("team_names"),
	locationName: text("location_name"),
	locationLat: doublePrecision("location_lat"),
	locationLng: doublePrecision("location_lng"),
	venue: text("venue"),
	seasonId: integer("season_id").references(() => seasons.id, { onDelete: "set null" }),
	payLink: text("pay_link").default("").notNull(),
	kickoffAt: timestamp("kickoff_at", { withTimezone: true, mode: "string" }).notNull(),
	extended: boolean().default(false).notNull(),
	teamColors: text("team_colors"),
	paymentCurrency: text("payment_currency").default("PLN").notNull(),
}, (table) => [
	index("idx_matches_status_played_on").using("btree", table.status.asc().nullsLast().op("text_ops"), table.playedOn.asc().nullsLast().op("text_ops")),
	check("matches_num_teams_check", sql`num_teams >= 2 AND num_teams <= 5`),
	check("matches_stats_scoring_enabled_check", sql`stats_scoring_enabled = ANY (ARRAY[0, 1])`),
	check("matches_status_check", sql`status = ANY (ARRAY['open'::text, 'closed'::text])`),
	check("matches_matchday_status_check", sql`matchday_status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])`),
	index("matches_kickoff_at_idx").on(table.kickoffAt),
]);

export const players = pgTable("players", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "players_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: text().notNull(),
	preferredPosition: text("preferred_position").notNull(),
	active: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	phone: text(),
	photoUrl: text("photo_url"),
	email: text(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	funMessages: boolean("fun_messages").default(true).notNull(),
}, (table) => [
	unique("players_name_key").on(table.name),
	check("players_preferred_position_check", sql`preferred_position = ANY (ARRAY['GK'::text, 'DEF'::text, 'MID'::text, 'FWD'::text])`),
]);

export const voteAudit = pgTable("vote_audit", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "vote_audit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	matchId: integer("match_id").notNull(),
	voterId: integer("voter_id").notNull(),
	votedForId: integer("voted_for_id").notNull(),
	action: text().notNull(),
	actor: text().notNull(),
	oldRating: integer("old_rating"),
	newRating: integer("new_rating"),
	oldInclude: integer("old_include"),
	newInclude: integer("new_include"),
	oldScopeStatus: text("old_scope_status"),
	newScopeStatus: text("new_scope_status"),
	note: text(),
	changedAt: timestamp("changed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "vote_audit_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.voterId],
			foreignColumns: [players.id],
			name: "vote_audit_voter_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.votedForId],
			foreignColumns: [players.id],
			name: "vote_audit_voted_for_id_fkey"
		}).onDelete("cascade"),
]);

export const playerGoalsClaims = pgTable("player_goals_claims", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "player_goals_claims_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	goalsClaimed: integer("goals_claimed").default(0).notNull(),
	status: text().default('pending').notNull(),
	reviewedBy: text("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "player_goals_claims_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "player_goals_claims_player_id_fkey"
		}).onDelete("cascade"),
	unique("player_goals_claims_match_id_player_id_key").on(table.matchId, table.playerId),
	check("player_goals_claims_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const playerAccessTokens = pgTable("player_access_tokens", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "player_access_tokens_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	playerId: integer("player_id").notNull(),
	token: text().notNull(),
	active: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	revokedAt: timestamp("revoked_at", { mode: 'string' }),
}, (table) => [
	index("idx_player_access_tokens_player_active").using("btree", table.playerId.asc().nullsLast().op("int4_ops"), table.active.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "player_access_tokens_player_id_fkey"
		}).onDelete("cascade"),
	unique("player_access_tokens_token_key").on(table.token),
	check("player_access_tokens_active_check", sql`active = ANY (ARRAY[0, 1])`),
]);

export const playerCredentials = pgTable("player_credentials", {
	playerId: integer("player_id").primaryKey().notNull(),
	passwordSalt: text("password_salt").notNull(),
	passwordHash: text("password_hash").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "player_credentials_player_id_fkey"
		}).onDelete("cascade"),
]);

export const appSettings = pgTable("app_settings", {
	key: text().primaryKey().notNull(),
	value: text().default("").notNull(),
});

export const playerKudos = pgTable("player_kudos", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "player_kudos_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	fromPlayerId: integer("from_player_id").notNull(),
	toPlayerId: integer("to_player_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_player_kudos_to").using("btree", table.toPlayerId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.fromPlayerId],
			foreignColumns: [players.id],
			name: "player_kudos_from_player_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toPlayerId],
			foreignColumns: [players.id],
			name: "player_kudos_to_player_id_fkey"
		}).onDelete("cascade"),
	unique("player_kudos_pair_uq").on(table.fromPlayerId, table.toPlayerId),
]);

export const playerStatsSubmissions = pgTable("player_stats_submissions", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "player_stats_submissions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	goals: integer().default(0).notNull(),
	assists: integer().default(0).notNull(),
	status: text().default('pending').notNull(),
	reviewedBy: text("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	penaltiesScored: integer("penalties_scored").default(0).notNull(),
	penaltiesConceded: integer("penalties_conceded").default(0).notNull(),
}, (table) => [
	index("idx_player_stats_submissions_player_status").using("btree", table.playerId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_player_stats_submissions_status_match").using("btree", table.status.asc().nullsLast().op("int4_ops"), table.matchId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "player_stats_submissions_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "player_stats_submissions_player_id_fkey"
		}).onDelete("cascade"),
	unique("player_stats_submissions_match_id_player_id_key").on(table.matchId, table.playerId),
	check("player_stats_submissions_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const passwordResetRequests = pgTable("password_reset_requests", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "password_reset_requests_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	playerId: integer("player_id").notNull(),
	requestedAt: timestamp("requested_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	status: text().default('pending').notNull(),
	resolvedBy: text("resolved_by"),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "password_reset_requests_player_id_fkey"
		}).onDelete("cascade"),
	check("password_reset_requests_status_check", sql`status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])`),
]);

export const legacyScoreSnapshots = pgTable("legacy_score_snapshots", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "legacy_score_snapshots_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	snapshotKey: text("snapshot_key").notNull(),
	playerId: integer("player_id").notNull(),
	final: doublePrecision().notNull(),
	peer: doublePrecision().notNull(),
	stat: doublePrecision(),
	hasStats: integer("has_stats").default(0).notNull(),
	payloadJson: text("payload_json"),
	modelVersion: text("model_version").default('legacy_v1').notNull(),
	capturedAt: timestamp("captured_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	revision: bigint({ mode: "bigint" }),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "legacy_score_snapshots_player_id_fkey"
		}).onDelete("cascade"),
	unique("legacy_score_snapshots_snapshot_key_player_id_key").on(table.playerId, table.snapshotKey),
	check("legacy_score_snapshots_has_stats_check", sql`has_stats = ANY (ARRAY[0, 1])`),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "password_reset_tokens_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	playerId: integer("player_id").notNull(),
	token: text().notNull(),
	used: integer().default(0).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "password_reset_tokens_player_id_fkey"
		}).onDelete("cascade"),
	unique("password_reset_tokens_token_key").on(table.token),
	check("password_reset_tokens_used_check", sql`used = ANY (ARRAY[0, 1])`),
]);

export const admins = pgTable("admins", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "admins_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	username: text().notNull(),
	passwordSalt: text("password_salt").notNull(),
	passwordHash: text("password_hash").notNull(),
	isSuper: integer("is_super").default(0).notNull(),
	active: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	playerId: integer("player_id"),
}, (table) => [
	unique("admins_username_key").on(table.username),
	check("admins_is_super_check", sql`is_super = ANY (ARRAY[0, 1])`),
	check("admins_active_check", sql`active = ANY (ARRAY[0, 1])`),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "admins_player_id_fkey"
		}).onDelete("set null"),
]);

export const adminTabLocks = pgTable("admin_tab_locks", {
	adminId: integer("admin_id").notNull(),
	tabKey: text("tab_key").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.adminId, table.tabKey], name: "admin_tab_locks_pkey" }),
	foreignKey({
			columns: [table.adminId],
			foreignColumns: [admins.id],
			name: "admin_tab_locks_admin_id_fkey"
		}).onDelete("cascade"),
]);

export const adminSessions = pgTable("admin_sessions", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "admin_sessions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	token: text().notNull(),
	username: text().notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
}, (table) => [
	unique("admin_sessions_token_key").on(table.token),
]);

export const statsAudit = pgTable("stats_audit", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "stats_audit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	action: text().notNull(),
	actor: text().notNull(),
	oldGoals: integer("old_goals"),
	newGoals: integer("new_goals"),
	oldAssists: integer("old_assists"),
	newAssists: integer("new_assists"),
	note: text(),
	changedAt: timestamp("changed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	oldPenaltiesScored: integer("old_penalties_scored"),
	newPenaltiesScored: integer("new_penalties_scored"),
	oldPenaltiesConceded: integer("old_penalties_conceded"),
	newPenaltiesConceded: integer("new_penalties_conceded"),
}, (table) => [
	index("idx_stats_audit_match_player").using("btree", table.matchId.asc().nullsLast().op("int4_ops"), table.playerId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "stats_audit_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "stats_audit_player_id_fkey"
		}).onDelete("cascade"),
]);

export const awardOverrides = pgTable("award_overrides", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "award_overrides_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	scopeKey: text("scope_key").notNull(),
	scopeType: text("scope_type").notNull(),
	matchId: integer("match_id"),
	awardType: text("award_type").notNull(),
	winnerPlayerIds: text("winner_player_ids").notNull(),
	reason: text().default("").notNull(),
	overriddenBy: text("overridden_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	unique("award_overrides_scope_key_award_type_key").on(table.awardType, table.scopeKey),
	check("award_overrides_scope_type_check", sql`scope_type = ANY (ARRAY['match'::text, 'overall'::text])`),
	check("award_overrides_award_type_check", sql`award_type = ANY (ARRAY['top_scorer'::text, 'top_goal_contribution'::text, 'top_defender'::text, 'motm'::text])`),
]);

export const awardOverrideAudit = pgTable("award_override_audit", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "award_override_audit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	scopeKey: text("scope_key").notNull(),
	scopeType: text("scope_type").notNull(),
	matchId: integer("match_id"),
	awardType: text("award_type").notNull(),
	winnerPlayerIds: text("winner_player_ids").notNull(),
	reason: text().default("").notNull(),
	actor: text().notNull(),
	changedAt: timestamp("changed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, () => [
	check("award_override_audit_scope_type_check", sql`scope_type = ANY (ARRAY['match'::text, 'overall'::text])`),
	check("award_override_audit_award_type_check", sql`award_type = ANY (ARRAY['top_scorer'::text, 'top_goal_contribution'::text, 'top_defender'::text, 'motm'::text])`),
]);

export const matchPlayers = pgTable("match_players", {
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	teamNo: integer("team_no").notNull(),
	positionPlayed: text("position_played").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "match_players_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "match_players_player_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.matchId, table.playerId], name: "match_players_pkey"}),
	check("match_players_position_played_check", sql`position_played = ANY (ARRAY['GK'::text, 'DEF'::text, 'MID'::text, 'FWD'::text])`),
]);

export const payments = pgTable("payments", {
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	paid: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_payments_match_paid").using("btree", table.matchId.asc().nullsLast().op("int4_ops"), table.paid.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "payments_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "payments_player_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.matchId, table.playerId], name: "payments_pkey"}),
	check("payments_paid_check", sql`paid = ANY (ARRAY[0, 1])`),
]);

export const matchAvailability = pgTable("match_availability", {
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	status: text().default('out').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "match_availability_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "match_availability_player_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.matchId, table.playerId], name: "match_availability_pkey"}),
	check("match_availability_status_check", sql`status = ANY (ARRAY['in'::text, 'out'::text])`),
]);

export const voteSkips = pgTable("vote_skips", {
	matchId: integer("match_id").notNull(),
	voterId: integer("voter_id").notNull(),
	skippedPlayerId: integer("skipped_player_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "vote_skips_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.voterId],
			foreignColumns: [players.id],
			name: "vote_skips_voter_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skippedPlayerId],
			foreignColumns: [players.id],
			name: "vote_skips_skipped_player_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.matchId, table.skippedPlayerId, table.voterId], name: "vote_skips_pkey"}),
]);

export const stats = pgTable("stats", {
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	goals: integer().default(0).notNull(),
	assists: integer().default(0).notNull(),
	penaltiesScored: integer("penalties_scored").default(0).notNull(),
	penaltiesConceded: integer("penalties_conceded").default(0).notNull(),
}, (table) => [
	index("idx_stats_match_player").using("btree", table.matchId.asc().nullsLast().op("int4_ops"), table.playerId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "stats_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "stats_player_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.matchId, table.playerId], name: "stats_pkey"}),
]);

export const legacyDefensiveStats = pgTable("legacy_defensive_stats", {
	sourceTable: text("source_table").notNull(),
	matchId: integer("match_id").notNull(),
	playerId: integer("player_id").notNull(),
	defensiveContributions: integer("defensive_contributions").default(0).notNull(),
	gkSaves: integer("gk_saves").default(0).notNull(),
	cleanSheet: integer("clean_sheet").default(0).notNull(),
	capturedAt: timestamp("captured_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.matchId, table.playerId, table.sourceTable], name: "legacy_defensive_stats_pkey"}),
	check("legacy_defensive_stats_source_table_check", sql`source_table = ANY (ARRAY['stats'::text, 'player_stats_submissions'::text])`),
]);

export const votes = pgTable("votes", {
	matchId: integer("match_id").notNull(),
	voterId: integer("voter_id").notNull(),
	votedForId: integer("voted_for_id").notNull(),
	rating: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	includeInCalculation: integer("include_in_calculation").default(1).notNull(),
	scopeStatus: text("scope_status").default('in_scope').notNull(),
}, (table) => [
	index("idx_votes_match_target").using("btree", table.matchId.asc().nullsLast().op("int4_ops"), table.votedForId.asc().nullsLast().op("int4_ops")),
	index("idx_votes_scope_include").using("btree", table.scopeStatus.asc().nullsLast().op("text_ops"), table.includeInCalculation.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.matchId],
			foreignColumns: [matches.id],
			name: "votes_match_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.voterId],
			foreignColumns: [players.id],
			name: "votes_voter_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.votedForId],
			foreignColumns: [players.id],
			name: "votes_voted_for_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.matchId, table.votedForId, table.voterId], name: "votes_pkey"}),
	check("votes_include_in_calculation_check", sql`include_in_calculation = ANY (ARRAY[0, 1])`),
	check("votes_scope_status_check", sql`scope_status = ANY (ARRAY['in_scope'::text, 'out_of_scope'::text, 'removed_from_calculation'::text])`),
	check("votes_rating_check", sql`(rating >= 0) AND (rating <= 10)`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	playerId: integer("player_id").references(() => players.id, { onDelete: "cascade" }),
	endpoint: text().notNull(),
	p256dh: text().notNull(),
	auth: text().notNull(),
	userAgent: text("user_agent").default("").notNull(),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_push_subscriptions_player_id").on(table.playerId),
	unique("push_subscriptions_endpoint_key").on(table.endpoint),
]);

export const pushPreferences = pgTable("push_preferences", {
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	typeKey: text("type_key").notNull(),
	enabled: integer().default(1).notNull(),
	updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.playerId, table.typeKey], name: "push_preferences_pkey" }),
	index("idx_push_preferences_player_id").on(table.playerId),
]);

export const matchGuests = pgTable("match_guests", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	hostPlayerId: integer("host_player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	name: text().notNull(),
	position: text().default("MID").notNull(),
	skill: integer().default(40).notNull(),
	teamNo: integer("team_no"),
	paid: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	status: text().default("approved").notNull(),
}, (table) => [
	index("idx_match_guests_match_id").on(table.matchId),
	index("idx_match_guests_host").on(table.hostPlayerId),
]);

export const seasons = pgTable("seasons", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	name: text().notNull(),
	startDate: text("start_date").notNull(),
	endDate: text("end_date"),
	status: text().default("active").notNull(),
	resetMode: text("reset_mode").default("soft").notNull(),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	subscriptionEnabled: boolean("subscription_enabled").default(false).notNull(),
	subscriberCap: integer("subscriber_cap").default(14).notNull(),
	terms: text().default("").notNull(),
	termsVersion: integer("terms_version").default(1).notNull(),
	signupOpen: boolean("signup_open").default(true).notNull(),
	dayRateMinor: integer("day_rate_minor").default(50000).notNull(),
	multisportCreditMinor: integer("multisport_credit_minor").default(1500).notNull(),
	paymentDueDay: integer("payment_due_day").default(3).notNull(),
	guestRateMinor: integer("guest_rate_minor").default(3600).notNull(),
	extensionCostMinor: integer("extension_cost_minor").default(10000).notNull(),
	extensionMinExtra: integer("extension_min_extra").default(4).notNull(),
	paymentName: text("payment_name").default("").notNull(),
	paymentAccount: text("payment_account").default("").notNull(),
	paymentMethod: text("payment_method").default("").notNull(),
	paymentNote: text("payment_note").default("").notNull(),
	payLink: text("pay_link").default("").notNull(),
	visibleToPlayers: boolean("visible_to_players").default(false).notNull(),
	ratesChangedAt: timestamp("rates_changed_at", { withTimezone: true, mode: "string" }),
	ratesConfirmedAt: timestamp("rates_confirmed_at", { withTimezone: true, mode: "string" }),
	termsFinalAt: timestamp("terms_final_at", { withTimezone: true, mode: "string" }),
	testInvoiceCompletedAt: timestamp("test_invoice_completed_at", { withTimezone: true, mode: "string" }),
	reminderTextReviewedAt: timestamp("reminder_text_reviewed_at", { withTimezone: true, mode: "string" }),
}, (table) => [
	check("seasons_status_check", sql`${table.status} = ANY (ARRAY['active'::text, 'archived'::text])`),
	check("seasons_reset_mode_check", sql`${table.resetMode} = ANY (ARRAY['soft'::text, 'hard'::text])`),
]);

export const playerAchievements = pgTable("player_achievements", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	achievementKey: text("achievement_key").notNull(),
	matchId: integer("match_id").references(() => matches.id, { onDelete: "set null" }),
	seasonId: integer("season_id").references(() => seasons.id, { onDelete: "set null" }),
	detail: text().default("").notNull(),
	awardedAt: timestamp("awarded_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	unique("player_achievements_player_key_unique").on(table.playerId, table.achievementKey),
	index("idx_player_achievements_player").on(table.playerId),
]);

export const matchMotmVotes = pgTable("match_motm_votes", {
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	voterId: integer("voter_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	votedForId: integer("voted_for_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.matchId, table.voterId], name: "match_motm_votes_pkey" }),
	index("idx_match_motm_votes_match").on(table.matchId),
]);

export const matchReactions = pgTable("match_reactions", {
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	emoji: text().notNull(),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.matchId, table.playerId, table.emoji], name: "match_reactions_pkey" }),
	index("idx_match_reactions_match").on(table.matchId),
]);

export const matchRounds = pgTable("match_rounds", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	roundNo: integer("round_no").notNull(),
	teamA: integer("team_a").notNull(),
	teamB: integer("team_b").notNull(),
	status: text().default("active").notNull(),
	timerRunning: integer("timer_running").default(0).notNull(),
	elapsedMs: bigint("elapsed_ms", { mode: "number" }).default(0).notNull(),
	startedAtMs: bigint("started_at_ms", { mode: "number" }),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	unique("match_rounds_match_round_unique").on(table.matchId, table.roundNo),
	index("idx_match_rounds_match").on(table.matchId),
	check("match_rounds_status_check", sql`status = ANY (ARRAY['active'::text, 'done'::text])`),
	check("match_rounds_timer_check", sql`timer_running = ANY (ARRAY[0, 1])`),
]);

export const matchScorekeepers = pgTable("match_scorekeepers", {
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.matchId, table.playerId], name: "match_scorekeepers_pkey" }),
	index("idx_match_scorekeepers_player").on(table.playerId),
]);

export const roundGoals = pgTable("round_goals", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	roundId: integer("round_id").notNull().references(() => matchRounds.id, { onDelete: "cascade" }),
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	teamNo: integer("team_no").notNull(),
	scorerPlayerId: integer("scorer_player_id").references(() => players.id, { onDelete: "set null" }),
	scorerGuestId: integer("scorer_guest_id").references(() => matchGuests.id, { onDelete: "set null" }),
	assistPlayerId: integer("assist_player_id").references(() => players.id, { onDelete: "set null" }),
	assistGuestId: integer("assist_guest_id").references(() => matchGuests.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	isOwnGoal: integer("is_own_goal").default(0).notNull(),
}, (table) => [
	index("idx_round_goals_round").on(table.roundId),
	index("idx_round_goals_match").on(table.matchId),
]);

export const seasonSubscriptions = pgTable("season_subscriptions", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	status: text().default("active").notNull(),
	acceptedTermsVersion: integer("accepted_terms_version").default(1).notNull(),
	acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	withdrawnAt: timestamp("withdrawn_at", { withTimezone: true, mode: "string" }),
	note: text().default("").notNull(),
	seatNo: integer("seat_no"),
}, (table) => [
	unique("season_subscriptions_unique").on(table.seasonId, table.playerId),
	index("season_subscriptions_season_idx").on(table.seasonId, table.status, table.acceptedAt),
	uniqueIndex("season_subscriptions_seat_idx").on(table.seasonId, table.seatNo).where(sql`status = 'active'`),
	check("season_subscriptions_status_check", sql`status = ANY (ARRAY['active'::text, 'withdrawn'::text])`),
]);

export const seasonInvoices = pgTable("season_invoices", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	period: text().notNull(),
	playingDays: integer("playing_days").notNull(),
	dayRateMinor: integer("day_rate_minor").notNull(),
	splitBetween: integer("split_between").notNull(),
	grossMinor: integer("gross_minor").notNull(),
	creditMinor: integer("credit_minor").default(0).notNull(),
	dueDate: text("due_date").notNull(),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }),
	note: text().default("").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	declaredPaidAt: timestamp("declared_paid_at", { withTimezone: true, mode: "string" }),
	declaredNote: text("declared_note").default("").notNull(),
}, (table) => [
	unique("season_invoices_unique").on(table.seasonId, table.playerId, table.period),
	index("season_invoices_period_idx").on(table.seasonId, table.period),
]);

export const multisportScans = pgTable("multisport_scans", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	status: text().default("pending").notNull(),
	creditMinor: integer("credit_minor").notNull(),
	reportedAt: timestamp("reported_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
	reviewedBy: text("reviewed_by").default("").notNull(),
	appliedInvoiceId: integer("applied_invoice_id").references(() => seasonInvoices.id, { onDelete: "set null" }),
}, (table) => [
	unique("multisport_scans_unique").on(table.matchId, table.playerId),
	index("multisport_scans_pending_idx").on(table.status, table.playerId),
	check("multisport_scans_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const guestCharges = pgTable("guest_charges", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
	playerId: integer("player_id").references(() => players.id, { onDelete: "cascade" }),
	guestId: integer("guest_id").references(() => matchGuests.id, { onDelete: "cascade" }),
	amountMinor: integer("amount_minor").notNull(),
	kind: text().default("extra").notNull(),
	owedToPlayerId: integer("owed_to_player_id").references(() => players.id, { onDelete: "set null" }),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("guest_charges_player_idx").on(table.matchId, table.playerId).where(sql`player_id IS NOT NULL`),
	uniqueIndex("guest_charges_guest_idx").on(table.matchId, table.guestId).where(sql`guest_id IS NOT NULL`),
	check("guest_charges_kind_check", sql`kind = ANY (ARRAY['extra'::text, 'replacement'::text])`),
	check("guest_charges_who_check", sql`(player_id IS NOT NULL) <> (guest_id IS NOT NULL)`),
	check("guest_charges_owed_check", sql`(kind = 'replacement') = (owed_to_player_id IS NOT NULL)`),
]);

export const fundAdjustments = pgTable("fund_adjustments", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
	amountMinor: integer("amount_minor").notNull(),
	note: text().default("").notNull(),
	createdBy: text("created_by").default("").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const playerMoments = pgTable("player_moments", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	kind: text().notNull(),
	matchId: integer("match_id").default(0).notNull(),
	payload: jsonb().default(sql`'{}'::jsonb`).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
	seenAt: timestamp("seen_at", { withTimezone: true, mode: "string" }),
}, (table) => [
	unique("player_moments_unique").on(table.playerId, table.kind, table.matchId),
	index("idx_player_moments_unseen").on(table.playerId).where(sql`seen_at IS NULL`),
]);

export const stories = pgTable("stories", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	imageUrl: text("image_url").notNull(),
	caption: text(),
	matchId: integer("match_id").references(() => matches.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).default(sql`(now() + interval '24 hours')`).notNull(),
}, (table) => [
	index("idx_stories_expires").on(table.expiresAt),
	index("idx_stories_player").on(table.playerId, table.expiresAt),
]);

export const storyViews = pgTable("story_views", {
	storyId: integer("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	seenAt: timestamp("seen_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.storyId, table.playerId], name: "story_views_pkey" }),
]);

export const storyReactions = pgTable("story_reactions", {
	storyId: integer("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
	playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
	emoji: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.storyId, table.playerId], name: "story_reactions_pkey" }),
]);

export const appErrors = pgTable("app_errors", {
	id: integer().primaryKey().generatedByDefaultAsIdentity(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
	source: text().notNull(),
	errorName: text("error_name").notNull(),
	message: text().notNull(),
}, (table) => [
	index("app_errors_occurred_at_idx").on(table.occurredAt.desc()),
]);

export const scoreCacheState = pgTable("score_cache_state", {
	id: integer().primaryKey(),
	revision: bigint({ mode: "bigint" }).notNull(),
}, (table) => [
	check("score_cache_state_singleton_check", sql`${table.id} = 1`),
]);

export const scoreCacheSnapshots = pgTable("score_cache_snapshots", {
	snapshotKey: text("snapshot_key").primaryKey(),
	revision: bigint({ mode: "bigint" }).notNull(),
	playerCount: integer("player_count").notNull(),
	modelVersion: text("model_version").notNull(),
	capturedAt: timestamp("captured_at", { withTimezone: true, mode: "string" }).default(sql`now()`).notNull(),
}, (table) => [
	index("score_cache_snapshots_revision_idx").on(table.revision, table.capturedAt.desc()),
]);
