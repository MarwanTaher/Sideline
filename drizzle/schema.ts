import { pgTable, index, check, integer, text, doublePrecision, timestamp, unique, foreignKey, primaryKey } from "drizzle-orm/pg-core"
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
}, (table) => [
	index("idx_matches_status_played_on").using("btree", table.status.asc().nullsLast().op("text_ops"), table.playedOn.asc().nullsLast().op("text_ops")),
	check("matches_num_teams_check", sql`num_teams >= 2 AND num_teams <= 5`),
	check("matches_stats_scoring_enabled_check", sql`stats_scoring_enabled = ANY (ARRAY[0, 1])`),
	check("matches_status_check", sql`status = ANY (ARRAY['open'::text, 'closed'::text])`),
	check("matches_matchday_status_check", sql`matchday_status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])`),
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
}, (table) => [
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
