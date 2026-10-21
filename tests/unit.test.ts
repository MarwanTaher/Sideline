/**
 * DB-free unit tests for pure helpers. Run: npm run test:unit
 */
import assert from "node:assert/strict";
import { getMatchPhase, phaseAction, type MatchPhaseInput } from "../src/lib/match-phase";
import {
  sortMoments,
  momentView,
  isBummer,
  MOMENT_PRIORITY,
  MOMENT_KIND_INFO,
  fillPlaceholders,
  sanitizeMomentCopy,
  type Moment,
} from "../src/lib/moment-copy";
import { createTapCounter } from "../src/lib/silly-sounds";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
const base: MatchPhaseInput = {
  matchdayStatus: "draft",
  availabilityOpen: true,
  kickoffAt: new Date(NOW + 72 * HOUR).toISOString(),
  lockEnabled: true,
  hasRoster: false,
};

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("match-phase");
test("open well before kickoff", () => {
  assert.equal(getMatchPhase(base, NOW), "open");
});
test("locked within 24h", () => {
  assert.equal(
    getMatchPhase({ ...base, kickoffAt: new Date(NOW + 23 * HOUR).toISOString() }, NOW),
    "locked",
  );
});
test("lock disabled keeps it open within 24h", () => {
  assert.equal(
    getMatchPhase(
      { ...base, lockEnabled: false, kickoffAt: new Date(NOW + 2 * HOUR).toISOString() },
      NOW,
    ),
    "open",
  );
});
test("admin-closed availability reads as locked", () => {
  assert.equal(getMatchPhase({ ...base, availabilityOpen: false }, NOW), "locked");
});
test("missing kickoff never locks by time", () => {
  assert.equal(getMatchPhase({ ...base, kickoffAt: null }, NOW), "open");
});
test("roster drafted -> teams", () => {
  assert.equal(getMatchPhase({ ...base, hasRoster: true }, NOW), "teams");
});
test("active -> matchday, closed -> done", () => {
  assert.equal(getMatchPhase({ ...base, matchdayStatus: "active", hasRoster: true }, NOW), "matchday");
  assert.equal(getMatchPhase({ ...base, matchdayStatus: "closed" }, NOW), "done");
});

console.log("phase-action");
const viewer = { isAdmin: false, canScore: false, onRoster: false };
test("pending player is asked to reply", () => {
  assert.equal(phaseAction("open", 5, { ...viewer, myStatus: "pending" })?.href, "/matches/5/availability");
});
test("admin in locked phase goes to draft", () => {
  assert.equal(phaseAction("locked", 5, { ...viewer, isAdmin: true })?.tab, "draft");
});
test("rostered player rates after the game", () => {
  assert.equal(phaseAction("done", 5, { ...viewer, onRoster: true })?.tab, "vote");
});
test("plain player in teams phase has no CTA", () => {
  assert.equal(phaseAction("teams", 5, viewer), null);
});

console.log("moments");
const mk = (id: number, kind: Moment["kind"], payload: Record<string, unknown> = {}, createdAt = "2026-10-21T10:00:00Z"): Moment => ({
  id, kind, matchId: 7, payload, createdAt,
});
test("sortMoments puts MOTM before kudos before bummers", () => {
  const sorted = sortMoments([mk(1, "bummer_winless"), mk(2, "kudos"), mk(3, "motm")]);
  assert.deepEqual(sorted.map((m) => m.id), [3, 2, 1]);
});
test("sortMoments breaks ties by newest", () => {
  const sorted = sortMoments([mk(1, "badge", {}, "2026-10-01"), mk(2, "badge", {}, "2026-10-05")]);
  assert.deepEqual(sorted.map((m) => m.id), [2, 1]);
});
test("bummers are tone bummer with a silver lining", () => {
  const v = momentView(mk(9, "bummer_winless", { silverLining: "You still assisted twice." }));
  assert.ok(isBummer("bummer_winless"));
  assert.equal(v.tone, "bummer");
  assert.ok(v.title.length > 0);
});
test("bummer copy is stable per id", () => {
  assert.equal(momentView(mk(4, "bummer_scoreless")).title, momentView(mk(4, "bummer_scoreless")).title);
});
test("team reveal names the team and teammates", () => {
  const v = momentView(mk(5, "team_reveal", { teamName: "Lions", teammates: ["Ali", "Omar"] }));
  assert.match(v.title, /Lions/);
  assert.match(v.body, /Ali, Omar/);
});
test("every kind renders", () => {
  for (const k of Object.keys(MOMENT_PRIORITY) as Moment["kind"][]) {
    const v = momentView(mk(1, k));
    assert.ok(v.title && v.emoji, k);
  }
});
console.log("editable messages");
test("placeholders fill; unknown ones stay as typed", () => {
  assert.equal(fillPlaceholders("{name} got {votes} {oops}", { name: "Ali", votes: "3" }), "Ali got 3 {oops}");
});
test("override replaces text, keeps tone, CTA and silver lining", () => {
  const m = mk(2, "bummer_winless", { silverLining: "2 assists" });
  const v = momentView(m, { overrides: { bummer_winless: [{ title: "Rough one, {name}", body: "Next time." }] }, name: "Ali Khan" });
  assert.equal(v.title, "Rough one, Ali");
  assert.equal(v.body, "Next time.");
  assert.equal(v.tone, "bummer");
  assert.equal(v.footnote, "2 assists");
  assert.ok(v.emoji.length > 0);
  const motm = momentView(mk(3, "motm", { votes: 5 }), { overrides: { motm: [{ emoji: "🐐", title: "GOAT", body: "{votes} votes" }] } });
  assert.equal(motm.emoji, "🐐");
  assert.equal(motm.body, "5 votes");
  assert.equal(motm.cta?.href, "/matches/7/recap");
});
test("no override falls back to the built-in copy", () => {
  assert.deepEqual(momentView(mk(4, "kudos"), { overrides: { motm: [{ title: "x", body: "y" }] } }), momentView(mk(4, "kudos")));
});
test("override variant pick is stable per id", () => {
  const o = { overrides: { badge: [1, 2, 3].map((n) => ({ title: `T${n}`, body: "" })) } };
  assert.equal(momentView(mk(8, "badge"), o).title, momentView(mk(8, "badge"), o).title);
  assert.equal(momentView(mk(8, "badge"), o).body, momentView(mk(8, "badge")).body);
});
test("sanitize drops junk, unknown kinds and clamps lengths", () => {
  const clean = sanitizeMomentCopy({
    motm: [{ title: "  Hi  ", body: "x".repeat(500) }, { title: "", body: "" }, "bad", ...Array(9).fill({ title: "a", body: "b" })],
    nope: [{ title: "x", body: "y" }],
    kudos: [],
  });
  assert.deepEqual(Object.keys(clean), ["motm"]);
  assert.equal(clean.motm!.length, 5);
  assert.equal(clean.motm![0].title, "Hi");
  assert.equal(clean.motm![0].body.length, 240);
  assert.deepEqual(sanitizeMomentCopy("garbage"), {});
});
test("every kind has editor info", () => {
  for (const k of Object.keys(MOMENT_PRIORITY) as Moment["kind"][]) assert.ok(MOMENT_KIND_INFO[k], k);
});
console.log("tap-spam");
test("3rd fast tap starts spam mode; every tap then fires with no delay", () => {
  const tap = createTapCounter();
  assert.deepEqual([0, 300, 600].map(tap), [false, false, true]);
  assert.deepEqual([700, 800, 1500, 2400].map(tap), [true, true, true, true]);
});
test("a 1s pause calms it down", () => {
  const tap = createTapCounter();
  [0, 200, 400].forEach(tap);
  assert.deepEqual([1400, 1500].map(tap), [false, false]);
  assert.equal(tap(1600), true);
});
test("slow taps never fire", () => {
  const tap = createTapCounter();
  assert.ok([0, 800, 1600, 2400, 3200, 4000].map(tap).every((f) => !f));
});
console.log(`\n${passed} passed`);
