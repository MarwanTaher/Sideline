import assert from "node:assert/strict";
import test from "node:test";
import type { Invoice } from "../src/lib/season-billing";
import {
  combinedTransferReference,
  monthLabel,
  summarizePlayerInvoices,
} from "../src/lib/season-payment-summary";

function inv(id: number, period: string, over: Partial<Invoice> = {}): Invoice {
  return {
    id,
    seasonId: 2,
    playerId: 1,
    name: "test_user",
    period,
    playingDays: 4,
    dayRateMinor: 36000,
    splitBetween: 14,
    grossMinor: 10286,
    chargedMinor: 10300,
    roundingMinor: 14,
    creditMinor: 0,
    totalMinor: 10300,
    dueDate: `${period}-10`,
    dueAtMs: Date.parse(`${period}-10T21:59:59Z`),
    paidAt: null,
    declaredPaidAt: null,
    createdAt: null,
    declaredNote: "",
    note: "",
    hiddenAt: null,
    ...over,
  };
}

test("open bills are summed together, oldest first, earliest deadline wins", () => {
  const s = summarizePlayerInvoices([inv(2, "2026-12"), inv(1, "2026-11", { totalMinor: 5000 })]);
  assert.deepEqual(s.toSend.map((i) => i.period), ["2026-11", "2026-12"]);
  assert.equal(s.toSendMinor, 15300);
  assert.equal(s.nextDueAtMs, Date.parse("2026-11-10T21:59:59Z"));
  assert.equal(s.previous.length, 0);
});

test("declared bills are 'sent', confirmed and fully credited bills are previous", () => {
  const s = summarizePlayerInvoices([
    inv(1, "2026-11", { paidAt: "2026-11-05T10:00:00Z" }),
    inv(2, "2026-12", { declaredPaidAt: "2026-12-02T10:00:00Z" }),
    inv(3, "2027-01", { totalMinor: 0, creditMinor: 10300 }),
    inv(4, "2027-02"),
  ]);
  assert.deepEqual(s.toSend.map((i) => i.id), [4]);
  assert.deepEqual(s.sent.map((i) => i.id), [2]);
  assert.equal(s.sentMinor, 10300);
  assert.deepEqual(s.previous.map((i) => i.id), [3, 1], "newest previous first");
});

test("all settled: nothing to send and no deadline", () => {
  const s = summarizePlayerInvoices([inv(1, "2026-11", { paidAt: "2026-11-05T10:00:00Z" })]);
  assert.equal(s.toSend.length, 0);
  assert.equal(s.sent.length, 0);
  assert.equal(s.nextDueAtMs, null);
});

test("combined reference collapses months within a year and fits the bank QR title", () => {
  assert.equal(combinedTransferReference("test_user", ["2026-11"]), "Sideline 2026-11 test_user");
  assert.equal(
    combinedTransferReference("test_user", ["2026-12", "2026-11"]),
    "Sideline 2026-11+12 test_user",
  );
  assert.equal(
    combinedTransferReference("test_user", ["2027-01", "2026-12", "2026-11"]),
    "Sideline 2026-11+12+2027-01 test_user",
  );
  assert.ok(new TextEncoder().encode(combinedTransferReference("test_user", ["2026-11", "2026-12"])).length <= 32);
});

test("month label", () => {
  assert.equal(monthLabel("2026-11"), "November 2026");
  assert.equal(monthLabel("bad"), "bad");
});
