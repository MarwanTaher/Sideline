import { relations } from "drizzle-orm/relations";
import { matches, voteAudit, players, playerGoalsClaims, playerAccessTokens, playerCredentials, playerStatsSubmissions, passwordResetRequests, legacyScoreSnapshots, passwordResetTokens, statsAudit, matchPlayers, payments, matchAvailability, voteSkips, stats, votes, pushSubscriptions, pushPreferences, matchGuests, seasons, playerAchievements, matchMotmVotes, matchReactions, matchRounds, matchScorekeepers, roundGoals, seasonSubscriptions, seasonInvoices, multisportScans, guestCharges, fundAdjustments, playerMoments, stories, storyViews, storyReactions, appErrors, scoreCacheState, scoreCacheSnapshots } from "./schema";

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

export const matchesRelations = relations(matches, ({one, many}) => ({
	season: one(seasons, {
		fields: [matches.seasonId],
		references: [seasons.id]
	}),
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
	matchGuests: many(matchGuests),
	playerAchievements: many(playerAchievements),
	matchMotmVotes: many(matchMotmVotes),
	matchReactions: many(matchReactions),
	matchRounds: many(matchRounds),
	matchScorekeepers: many(matchScorekeepers),
	roundGoals: many(roundGoals),
	guestCharges: many(guestCharges),
	multisportScans: many(multisportScans),
	stories: many(stories),
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
	pushSubscriptions: many(pushSubscriptions),
	pushPreferences: many(pushPreferences),
	matchGuests_hostPlayerId: many(matchGuests, {
		relationName: "matchGuests_hostPlayerId_players_id"
	}),
	playerAchievements: many(playerAchievements),
	matchMotmVotes_voterId: many(matchMotmVotes, {
		relationName: "matchMotmVotes_voterId_players_id"
	}),
	matchMotmVotes_votedForId: many(matchMotmVotes, {
		relationName: "matchMotmVotes_votedForId_players_id"
	}),
	matchReactions: many(matchReactions),
	matchScorekeepers: many(matchScorekeepers),
	roundGoals_scorerPlayerId: many(roundGoals, {
		relationName: "roundGoals_scorerPlayerId_players_id"
	}),
	roundGoals_assistPlayerId: many(roundGoals, {
		relationName: "roundGoals_assistPlayerId_players_id"
	}),
	seasonSubscriptions: many(seasonSubscriptions),
	seasonInvoices: many(seasonInvoices),
	multisportScans: many(multisportScans),
	guestCharges_playerId: many(guestCharges, {
		relationName: "guestCharges_playerId_players_id"
	}),
	guestCharges_owedToPlayerId: many(guestCharges, {
		relationName: "guestCharges_owedToPlayerId_players_id"
	}),
	playerMoments: many(playerMoments),
	stories: many(stories),
	storyViews: many(storyViews),
	storyReactions: many(storyReactions),
}));

export const seasonsRelations = relations(seasons, ({many}) => ({
	matches: many(matches),
	playerAchievements: many(playerAchievements),
	seasonSubscriptions: many(seasonSubscriptions),
	seasonInvoices: many(seasonInvoices),
	fundAdjustments: many(fundAdjustments),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({one}) => ({
	player: one(players, {
		fields: [pushSubscriptions.playerId],
		references: [players.id]
	}),
}));

export const pushPreferencesRelations = relations(pushPreferences, ({one}) => ({
	player: one(players, {
		fields: [pushPreferences.playerId],
		references: [players.id]
	}),
}));

export const matchGuestsRelations = relations(matchGuests, ({one, many}) => ({
	match: one(matches, {
		fields: [matchGuests.matchId],
		references: [matches.id]
	}),
	host: one(players, {
		fields: [matchGuests.hostPlayerId],
		references: [players.id],
		relationName: "matchGuests_hostPlayerId_players_id"
	}),
	roundGoals_scorerGuestId: many(roundGoals, {
		relationName: "roundGoals_scorerGuestId_matchGuests_id"
	}),
	roundGoals_assistGuestId: many(roundGoals, {
		relationName: "roundGoals_assistGuestId_matchGuests_id"
	}),
	guestCharges: many(guestCharges),
}));

export const playerAchievementsRelations = relations(playerAchievements, ({one}) => ({
	player: one(players, {
		fields: [playerAchievements.playerId],
		references: [players.id]
	}),
	match: one(matches, {
		fields: [playerAchievements.matchId],
		references: [matches.id]
	}),
	season: one(seasons, {
		fields: [playerAchievements.seasonId],
		references: [seasons.id]
	}),
}));

export const matchMotmVotesRelations = relations(matchMotmVotes, ({one}) => ({
	match: one(matches, {
		fields: [matchMotmVotes.matchId],
		references: [matches.id]
	}),
	voter: one(players, {
		fields: [matchMotmVotes.voterId],
		references: [players.id],
		relationName: "matchMotmVotes_voterId_players_id"
	}),
	votedFor: one(players, {
		fields: [matchMotmVotes.votedForId],
		references: [players.id],
		relationName: "matchMotmVotes_votedForId_players_id"
	}),
}));

export const matchReactionsRelations = relations(matchReactions, ({one}) => ({
	match: one(matches, {
		fields: [matchReactions.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [matchReactions.playerId],
		references: [players.id]
	}),
}));

export const matchRoundsRelations = relations(matchRounds, ({one, many}) => ({
	match: one(matches, {
		fields: [matchRounds.matchId],
		references: [matches.id]
	}),
	roundGoals: many(roundGoals),
}));

export const matchScorekeepersRelations = relations(matchScorekeepers, ({one}) => ({
	match: one(matches, {
		fields: [matchScorekeepers.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [matchScorekeepers.playerId],
		references: [players.id]
	}),
}));

export const roundGoalsRelations = relations(roundGoals, ({one}) => ({
	match: one(matches, {
		fields: [roundGoals.matchId],
		references: [matches.id]
	}),
	round: one(matchRounds, {
		fields: [roundGoals.roundId],
		references: [matchRounds.id]
	}),
	scorerPlayer: one(players, {
		fields: [roundGoals.scorerPlayerId],
		references: [players.id],
		relationName: "roundGoals_scorerPlayerId_players_id"
	}),
	assistPlayer: one(players, {
		fields: [roundGoals.assistPlayerId],
		references: [players.id],
		relationName: "roundGoals_assistPlayerId_players_id"
	}),
	scorerGuest: one(matchGuests, {
		fields: [roundGoals.scorerGuestId],
		references: [matchGuests.id],
		relationName: "roundGoals_scorerGuestId_matchGuests_id"
	}),
	assistGuest: one(matchGuests, {
		fields: [roundGoals.assistGuestId],
		references: [matchGuests.id],
		relationName: "roundGoals_assistGuestId_matchGuests_id"
	}),
}));

export const seasonSubscriptionsRelations = relations(seasonSubscriptions, ({one}) => ({
	season: one(seasons, {
		fields: [seasonSubscriptions.seasonId],
		references: [seasons.id]
	}),
	player: one(players, {
		fields: [seasonSubscriptions.playerId],
		references: [players.id]
	}),
}));

export const seasonInvoicesRelations = relations(seasonInvoices, ({one, many}) => ({
	season: one(seasons, {
		fields: [seasonInvoices.seasonId],
		references: [seasons.id]
	}),
	player: one(players, {
		fields: [seasonInvoices.playerId],
		references: [players.id]
	}),
	multisportScans: many(multisportScans),
}));

export const multisportScansRelations = relations(multisportScans, ({one}) => ({
	match: one(matches, {
		fields: [multisportScans.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [multisportScans.playerId],
		references: [players.id]
	}),
	appliedInvoice: one(seasonInvoices, {
		fields: [multisportScans.appliedInvoiceId],
		references: [seasonInvoices.id]
	}),
}));

export const guestChargesRelations = relations(guestCharges, ({one}) => ({
	match: one(matches, {
		fields: [guestCharges.matchId],
		references: [matches.id]
	}),
	player: one(players, {
		fields: [guestCharges.playerId],
		references: [players.id],
		relationName: "guestCharges_playerId_players_id"
	}),
	guest: one(matchGuests, {
		fields: [guestCharges.guestId],
		references: [matchGuests.id]
	}),
	owedTo: one(players, {
		fields: [guestCharges.owedToPlayerId],
		references: [players.id],
		relationName: "guestCharges_owedToPlayerId_players_id"
	}),
}));

export const fundAdjustmentsRelations = relations(fundAdjustments, ({one}) => ({
	season: one(seasons, {
		fields: [fundAdjustments.seasonId],
		references: [seasons.id]
	}),
}));

export const playerMomentsRelations = relations(playerMoments, ({one}) => ({
	player: one(players, {
		fields: [playerMoments.playerId],
		references: [players.id]
	}),
}));

export const storiesRelations = relations(stories, ({one, many}) => ({
	player: one(players, {
		fields: [stories.playerId],
		references: [players.id]
	}),
	match: one(matches, {
		fields: [stories.matchId],
		references: [matches.id]
	}),
	views: many(storyViews),
	reactions: many(storyReactions),
}));

export const storyViewsRelations = relations(storyViews, ({one}) => ({
	story: one(stories, {
		fields: [storyViews.storyId],
		references: [stories.id]
	}),
	player: one(players, {
		fields: [storyViews.playerId],
		references: [players.id]
	}),
}));

export const storyReactionsRelations = relations(storyReactions, ({one}) => ({
	story: one(stories, {
		fields: [storyReactions.storyId],
		references: [stories.id]
	}),
	player: one(players, {
		fields: [storyReactions.playerId],
		references: [players.id]
	}),
}));

export const appErrorsRelations = relations(appErrors, () => ({}));

export const scoreCacheStateRelations = relations(scoreCacheState, () => ({}));

export const scoreCacheSnapshotsRelations = relations(scoreCacheSnapshots, ({many}) => ({
	entries: many(legacyScoreSnapshots),
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
	scoreCacheSnapshot: one(scoreCacheSnapshots, {
		fields: [legacyScoreSnapshots.snapshotKey],
		references: [scoreCacheSnapshots.snapshotKey]
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