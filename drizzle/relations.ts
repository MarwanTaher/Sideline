import { relations } from "drizzle-orm/relations";
import { matches, voteAudit, players, playerGoalsClaims, playerAccessTokens, playerCredentials, playerStatsSubmissions, passwordResetRequests, legacyScoreSnapshots, passwordResetTokens, statsAudit, matchPlayers, payments, matchAvailability, voteSkips, stats, votes } from "./schema";

export const voteAuditRelations = relations(voteAudit, ({one}) => ({
	match: one(matches, {
		fields: [voteAudit.matchId],
		references: [matches.id]
	}),
	player_voterId: one(players, {
		fields: [voteAudit.voterId],
		references: [players.id],
		relationName: "voteAudit_voterId_players_id"
	}),
	player_votedForId: one(players, {
		fields: [voteAudit.votedForId],
		references: [players.id],
		relationName: "voteAudit_votedForId_players_id"
	}),
}));

export const matchesRelations = relations(matches, ({many}) => ({
	voteAudits: many(voteAudit),
	playerGoalsClaims: many(playerGoalsClaims),
	playerStatsSubmissions: many(playerStatsSubmissions),
	statsAudits: many(statsAudit),
	matchPlayers: many(matchPlayers),
	payments: many(payments),
	matchAvailabilities: many(matchAvailability),
	voteSkips: many(voteSkips),
	stats: many(stats),
	votes: many(votes),
}));

export const playersRelations = relations(players, ({many}) => ({
	voteAudits_voterId: many(voteAudit, {
		relationName: "voteAudit_voterId_players_id"
	}),
	voteAudits_votedForId: many(voteAudit, {
		relationName: "voteAudit_votedForId_players_id"
	}),
	playerGoalsClaims: many(playerGoalsClaims),
	playerAccessTokens: many(playerAccessTokens),
	playerCredentials: many(playerCredentials),
	playerStatsSubmissions: many(playerStatsSubmissions),
	passwordResetRequests: many(passwordResetRequests),
	legacyScoreSnapshots: many(legacyScoreSnapshots),
	passwordResetTokens: many(passwordResetTokens),
	statsAudits: many(statsAudit),
	matchPlayers: many(matchPlayers),
	payments: many(payments),
	matchAvailabilities: many(matchAvailability),
	voteSkips_voterId: many(voteSkips, {
		relationName: "voteSkips_voterId_players_id"
	}),
	voteSkips_skippedPlayerId: many(voteSkips, {
		relationName: "voteSkips_skippedPlayerId_players_id"
	}),
	stats: many(stats),
	votes_voterId: many(votes, {
		relationName: "votes_voterId_players_id"
	}),
	votes_votedForId: many(votes, {
		relationName: "votes_votedForId_players_id"
	}),
}));

export const playerGoalsClaimsRelations = relations(playerGoalsClaims, ({one}) => ({
	match: one(matches, {
		fields: [playerGoalsClaims.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [playerGoalsClaims.playerId],
		references: [players.id]
	}),
}));

export const playerAccessTokensRelations = relations(playerAccessTokens, ({one}) => ({
	player: one(players, {
		fields: [playerAccessTokens.playerId],
		references: [players.id]
	}),
}));

export const playerCredentialsRelations = relations(playerCredentials, ({one}) => ({
	player: one(players, {
		fields: [playerCredentials.playerId],
		references: [players.id]
	}),
}));

export const playerStatsSubmissionsRelations = relations(playerStatsSubmissions, ({one}) => ({
	match: one(matches, {
		fields: [playerStatsSubmissions.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [playerStatsSubmissions.playerId],
		references: [players.id]
	}),
}));

export const passwordResetRequestsRelations = relations(passwordResetRequests, ({one}) => ({
	player: one(players, {
		fields: [passwordResetRequests.playerId],
		references: [players.id]
	}),
}));

export const legacyScoreSnapshotsRelations = relations(legacyScoreSnapshots, ({one}) => ({
	player: one(players, {
		fields: [legacyScoreSnapshots.playerId],
		references: [players.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	player: one(players, {
		fields: [passwordResetTokens.playerId],
		references: [players.id]
	}),
}));

export const statsAuditRelations = relations(statsAudit, ({one}) => ({
	match: one(matches, {
		fields: [statsAudit.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [statsAudit.playerId],
		references: [players.id]
	}),
}));

export const matchPlayersRelations = relations(matchPlayers, ({one}) => ({
	match: one(matches, {
		fields: [matchPlayers.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [matchPlayers.playerId],
		references: [players.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one}) => ({
	match: one(matches, {
		fields: [payments.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [payments.playerId],
		references: [players.id]
	}),
}));

export const matchAvailabilityRelations = relations(matchAvailability, ({one}) => ({
	match: one(matches, {
		fields: [matchAvailability.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [matchAvailability.playerId],
		references: [players.id]
	}),
}));

export const voteSkipsRelations = relations(voteSkips, ({one}) => ({
	match: one(matches, {
		fields: [voteSkips.matchId],
		references: [matches.id]
	}),
	player_voterId: one(players, {
		fields: [voteSkips.voterId],
		references: [players.id],
		relationName: "voteSkips_voterId_players_id"
	}),
	player_skippedPlayerId: one(players, {
		fields: [voteSkips.skippedPlayerId],
		references: [players.id],
		relationName: "voteSkips_skippedPlayerId_players_id"
	}),
}));

export const statsRelations = relations(stats, ({one}) => ({
	match: one(matches, {
		fields: [stats.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [stats.playerId],
		references: [players.id]
	}),
}));

export const votesRelations = relations(votes, ({one}) => ({
	match: one(matches, {
		fields: [votes.matchId],
		references: [matches.id]
	}),
	player_voterId: one(players, {
		fields: [votes.voterId],
		references: [players.id],
		relationName: "votes_voterId_players_id"
	}),
	player_votedForId: one(players, {
		fields: [votes.votedForId],
		references: [players.id],
		relationName: "votes_votedForId_players_id"
	}),
}));