import assert from "node:assert/strict";
import test from "node:test";
import { calendarDates, occurrenceTimes, effectiveDuration, mergeCalendarDates } from "../src/lib/match-recurrence";
import { isWithinAvailabilityLock } from "../src/lib/match-schedule";
import { playingDaysInPeriod } from "../src/lib/season-calculations";

const recurrence = { weekday: 0, kickoffTime: "21:00", openingWeekday: 5, openingTime: "15:00" };

test("existing winter season has 21 bookings with optional, not guaranteed, extensions", () => {
  const dates = calendarDates("2026-11-08", "2027-03-30", 0);
  assert.equal(dates.length, 21);
  assert.equal(dates[0], "2026-11-08");
  assert.equal(dates.at(-1), "2027-03-28");
  assert.equal(dates.length * 500, 10500);
  assert.equal(dates.length * 100, 2100);
  assert.equal(effectiveDuration(90, 30, false), 90);
  assert.equal(effectiveDuration(90, 30, true), 120);
  assert.deepEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].map((period) =>
    playingDaysInPeriod(period, "2026-11-08", "2027-03-30", { weekday: 0, waivedDates: [] })), [4, 4, 5, 4, 4]);
});

test("template weekday edits retain historical, active and cancellation booking dates", () => {
  const dates = mergeCalendarDates(["2026-11-08","2026-11-15","2026-11-22"],["2026-11-09","2026-11-16","2026-11-23"],["2026-11-08"],"2026-11-08");
  assert.deepEqual(dates,["2026-11-08","2026-11-09","2026-11-16","2026-11-23"]);
  assert.equal(playingDaysInPeriod("2026-11","2026-11-08","2026-11-30",{weekday:1,waivedDates:[],scheduledDates:dates}),4);
});

test("Warsaw opening and elapsed-hour lock survive the March DST transition", () => {
  assert.deepEqual(occurrenceTimes("2026-11-08", recurrence), {
    kickoffAt: "2026-11-08T20:00:00.000Z", opensAt: "2026-11-06T14:00:00.000Z", locksAt: "2026-11-07T20:00:00.000Z",
  });
  const march = occurrenceTimes("2027-03-28", recurrence);
  assert.deepEqual(march, { kickoffAt: "2027-03-28T19:00:00.000Z", opensAt: "2027-03-26T14:00:00.000Z", locksAt: "2027-03-27T19:00:00.000Z" });
  const lock = Date.parse(march.locksAt);
  assert.equal(isWithinAvailabilityLock(march.kickoffAt, lock - 1), false);
  assert.equal(isWithinAvailabilityLock(march.kickoffAt, lock), true);
  assert.equal(isWithinAvailabilityLock(march.kickoffAt, lock + 1), true);
});

test("recurrence uses configured weekday and waivers without changing legacy Sunday counting", () => {
  assert.equal(playingDaysInPeriod("2026-11", "2026-11-08", "2027-03-30"), 4);
  assert.equal(playingDaysInPeriod("2026-11", "2026-11-08", "2027-03-30", { weekday: 0, waivedDates: ["2026-11-15"] }), 3);
  assert.equal(playingDaysInPeriod("2026-11", "2026-11-08", "2027-03-30", { weekday: 1, waivedDates: [] }), 4);
  assert.equal(playingDaysInPeriod("2026-10", "2026-11-08", "2027-03-30", { weekday: 0, waivedDates: [] }), 0);
  assert.throws(() => calendarDates("2026-02-30", "2026-03-01", 0), /valid calendar/);
  assert.throws(() => calendarDates("2027-01-01", "2026-01-01", 0), /Season must/);
  assert.throws(() => occurrenceTimes("2026-11-08", { ...recurrence, openingWeekday: 6, openingTime: "21:00" }), /24-hour/);
});
