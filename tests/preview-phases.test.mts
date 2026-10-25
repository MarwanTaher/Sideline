import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

// Explicit opt-in and an independently specified host prevent accidental live-data tests.
const local = parse(readFileSync(".env.local"));
if (
  process.env.ALLOW_PREVIEW_DB_TESTS !== "1" ||
  !process.env.PREVIEW_DATABASE_HOST ||
  new URL(local.DATABASE_URL).hostname !== process.env.PREVIEW_DATABASE_HOST
) {
  throw new Error("Preview tests require explicit approval and a matching PREVIEW_DATABASE_HOST.");
}
process.env.DATABASE_URL = local.DATABASE_URL;

const { sqlClient: sql } = await import("../src/lib/db");
const billing = await import("../src/lib/season-billing");
const subscriptions = await import("../src/lib/season-subscriptions");
const { createMatch } = await import("../src/lib/match-admin");
const { captureScoreSnapshot } = await import("../src/lib/score-snapshots");
const { readCurrentScoreSnapshot } = await import("../src/lib/score-cache");
const { getScoringPolicy } = await import("../src/lib/scoring");
const { sendSeasonInvoiceReminder } = await import("../src/lib/season-reminders");
const { logAppError } = await import("../src/lib/error-log");

const [{ count }] = await sql.query("SELECT count(*)::int AS count FROM push_subscriptions");
assert.equal(count, 0, "Refuse integration tests while any push device is registered.");

const marker = `__phase_test_${randomUUID()}`;
const players: number[] = [];
const matches: number[] = [];
let seasonId: number | undefined;
const snapshotKey = marker;
const scoringKey = `scoring_${marker}`;
const errorSource = `integration.${randomUUID()}`;

async function revision(): Promise<bigint> {
  const [row] = await sql.query("SELECT revision::text FROM score_cache_state WHERE id = 1");
  return BigInt(row.revision);
}

try {
  for (let i = 0; i < 3; i++) {
    const [row] = await sql.query(
      "INSERT INTO players(name, preferred_position) VALUES ($1, 'MID') RETURNING id",
      [`${marker}_${i}`],
    );
    players.push(Number(row.id));
  }
  const [season] = await sql.query(
    `INSERT INTO seasons(name, start_date, end_date, status, subscription_enabled,
                         subscriber_cap, terms, visible_to_players)
     VALUES ($1, '2099-01-01', '2099-03-31', 'archived', true, 1, 'Test terms', false)
     RETURNING id`,
    [marker],
  );
  seasonId = Number(season.id);
  assert.equal((await billing.getSeasonGoLiveChecklist(seasonId))?.complete, false);
  await assert.rejects(subscriptions.updateSeasonSubscriptionSettings(seasonId, {
    subscriptionEnabled: true, subscriberCap: 1, terms: "Test terms",
    signupOpen: true, visibleToPlayers: true, bumpTermsVersion: false,
  }), /go-live checklist/);
  for (const key of ["ratesConfirmed", "termsFinal", "testInvoiceCompleted", "reminderTextReviewed"] as const) {
    await billing.setSeasonGoLiveCheck(seasonId, key, true);
  }
  assert.equal((await billing.getSeasonGoLiveChecklist(seasonId))?.complete, false);
  await billing.updatePaymentDetails(seasonId, {
    paymentName: "Test Football", paymentAccount: "86105000021234567890123456",
    paymentMethod: "Bank transfer", paymentNote: "", payLink: "",
  });
  assert.equal((await billing.getSeasonGoLiveChecklist(seasonId))?.complete, true);
  const rates = await billing.getSeasonRates(seasonId);
  assert.ok(rates);
  await billing.updateSeasonRates(seasonId, { ...rates, dayRateMinor: rates.dayRateMinor + 100 });
  assert.equal((await billing.getSeasonGoLiveChecklist(seasonId))?.ratesConfirmed, false);
  assert.ok((await billing.getSeasonRates(seasonId))?.ratesChangedAt);
  await billing.setSeasonGoLiveCheck(seasonId, "ratesConfirmed", true);
  await subscriptions.updateSeasonSubscriptionSettings(seasonId, {
    subscriptionEnabled: true, subscriberCap: 1, terms: "Revised test terms",
    signupOpen: true, visibleToPlayers: false, bumpTermsVersion: true,
  });
  assert.equal((await billing.getSeasonGoLiveChecklist(seasonId))?.termsFinal, false);
  await billing.setSeasonGoLiveCheck(seasonId, "termsFinal", true);
  await subscriptions.updateSeasonSubscriptionSettings(seasonId, {
    subscriptionEnabled: true, subscriberCap: 1, terms: "Revised test terms",
    signupOpen: true, visibleToPlayers: true, bumpTermsVersion: false,
  });
  console.log("PASS: go-live checklist, rate-change and terms-change safeguards");

  assert.equal((await subscriptions.subscribePlayer(seasonId, players[0], 2)).ok, true);
  await Promise.all(players.slice(1).map((id) => subscriptions.joinSeasonWaitlist(seasonId!, id)));
  const waiting = await subscriptions.listSeasonWaitlist(seasonId);
  assert.deepEqual(new Set(waiting.map((p) => p.playerId)), new Set(players.slice(1)));
  assert.deepEqual(await subscriptions.subscribePlayer(seasonId, players[1], 2), { ok: false, reason: "full" });
  const matchId = await createMatch({
    playedOn: "2099-01-04", matchTime: "09:00 pm", numTeams: 2,
    statsScoringEnabled: true, seasonId,
  });
  matches.push(matchId);
  const availability = await sql.query("SELECT player_id, status FROM match_availability WHERE match_id = $1", [matchId]);
  assert.deepEqual(availability.map((r) => [Number(r.player_id), r.status]), [[players[0], "in"]]);
  await sql.query(
    "INSERT INTO multisport_scans(match_id, player_id, status, credit_minor) VALUES ($1, $2, 'approved', 1500)",
    [matchId, players[0]],
  );
  console.log("PASS: concurrent waitlist joins, seat cap and atomic match auto-IN");

  await Promise.all(["2099-01", "2099-02"].map((period) => billing.generateInvoices(seasonId!, period)));
  let invoices = await billing.listInvoices(seasonId);
  assert.equal(invoices.length, 2);
  assert.equal(invoices.reduce((sum, i) => sum + i.creditMinor, 0), 1500, "Concurrent periods must not claim the same credit twice.");
  const credited = invoices.find((i) => i.creditMinor === 1500);
  assert.ok(credited);
  assert.equal((await billing.generateInvoices(seasonId, credited.period)).created, 0);
  await billing.deleteInvoice(credited.id);
  const [released] = await sql.query("SELECT applied_invoice_id FROM multisport_scans WHERE match_id = $1", [matchId]);
  assert.equal(released.applied_invoice_id, null);
  await billing.generateInvoices(seasonId, credited.period);
  invoices = await billing.listInvoices(seasonId);
  assert.equal(invoices.reduce((sum, i) => sum + i.creditMinor, 0), 1500);
  await billing.declareInvoicePaid(invoices[0].id, players[0], true, "Test declaration");
  assert.equal(await billing.confirmDeclaredInvoices(seasonId, invoices[0].period), 1);
  assert.equal(await billing.confirmDeclaredInvoices(seasonId, invoices[0].period), 0);
  await subscriptions.withdrawPlayer(seasonId, players[0]);
  assert.equal((await billing.listWithdrawnWithOpenInvoices(seasonId)).length, 1);
  const [offer] = await sql.query("SELECT value FROM app_settings WHERE key = $1", [`season_waitlist_offer_${seasonId}`]);
  assert.ok(players.slice(1).includes(Number(offer.value)));
  const unpaid = (await billing.listInvoices(seasonId)).find((invoice) => !invoice.paidAt);
  assert.ok(unpaid);
  await sql.query("UPDATE season_invoices SET credit_minor = 99999999 WHERE id = $1", [unpaid.id]);
  assert.equal(await sendSeasonInvoiceReminder(unpaid.id), false);
  assert.equal((await billing.listOutstandingInvoices(seasonId)).length, 0);
  console.log("PASS: concurrent credit allocation, duplicate invoices, credit release, bulk confirmation and withdrawal warning");

  await sql.query(
    "INSERT INTO match_players(match_id,player_id,team_no,position_played) VALUES ($1,$2,1,'MID'),($1,$3,2,'FWD')",
    [matchId, players[0], players[1]],
  );
  assert.equal(await captureScoreSnapshot(snapshotKey), true);
  const state = await readCurrentScoreSnapshot();
  if ((await getScoringPolicy()).recency_decay <= 0) assert.ok(state.snapshot, "Current exact-revision payload should be reusable.");
  const beforeRead = await revision();
  await readCurrentScoreSnapshot();
  assert.equal(await revision(), beforeRead, "Read paths must not write scoring inputs.");
  for (const [statement, parameters] of [
    ["UPDATE players SET preferred_position = 'FWD' WHERE id = $1", [players[0]]],
    ["UPDATE matches SET stats_scoring_enabled = 0 WHERE id = $1", [matchId]],
    ["UPDATE match_players SET position_played = 'DEF' WHERE match_id = $1 AND player_id = $2", [matchId, players[0]]],
    ["INSERT INTO votes(match_id,voter_id,voted_for_id,rating) VALUES ($1,$2,$3,8)", [matchId, players[0], players[1]]],
    ["INSERT INTO stats(match_id,player_id,goals) VALUES ($1,$2,1)", [matchId, players[0]]],
    ["INSERT INTO player_stats_submissions(match_id,player_id,goals) VALUES ($1,$2,1)", [matchId, players[0]]],
    ["INSERT INTO app_settings(key,value) VALUES ($1,'1')", [scoringKey]],
  ] as const) {
    const before = await revision();
    await sql.query(statement, [...parameters]);
    assert.ok((await revision()) > before, `Missing revision advance: ${statement}`);
    assert.equal((await readCurrentScoreSnapshot()).snapshot, null);
  }
  const beforeUnrelated = await revision();
  await sql.query("INSERT INTO app_settings(key,value) VALUES ($1,'1')", [marker]);
  assert.equal(await revision(), beforeUnrelated, "Unrelated settings must not invalidate scores.");
  console.log("PASS: exact-revision snapshots, read-only lookup and all seven scoring-input triggers");
  await logAppError(new Error("Integration failure; Authorization: Bearer fake-test-token"), errorSource);
  const [error] = await sql.query("SELECT source, message FROM app_errors WHERE source = $1", [errorSource]);
  assert.equal(error.source, errorSource);
  assert.ok(!String(error.message).includes("fake-test-token"));
  console.log("PASS: persisted server errors redact authorization credentials");
} finally {
  await sql.query("DELETE FROM app_errors WHERE source = $1", [errorSource]);
  await sql.query("DELETE FROM app_settings WHERE key = ANY($1::text[])", [[
    marker, scoringKey, `season_waitlist_${seasonId}`, `season_waitlist_offer_${seasonId}`,
  ]]);
  await sql.query("DELETE FROM score_cache_snapshots WHERE snapshot_key = $1", [snapshotKey]);
  await sql.query("DELETE FROM legacy_score_snapshots WHERE snapshot_key = $1", [snapshotKey]);
  if (matches.length) await sql.query("DELETE FROM matches WHERE id = ANY($1::int[])", [matches]);
  if (seasonId != null) await sql.query("DELETE FROM seasons WHERE id = $1", [seasonId]);
  if (players.length) await sql.query("DELETE FROM players WHERE id = ANY($1::int[])", [players]);
  console.log("Fixture cleanup complete.");
}
