import { test } from "node:test";
import assert from "node:assert/strict";
import { checkArrivalWindow, expectedStart, minutesLate } from "./calculators.js";

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`);

test("minutesLate is zero when early or on time", () => {
  assert.equal(minutesLate(at("10:00"), at("09:45")), 0);
  assert.equal(minutesLate(at("10:00"), at("10:00")), 0);
});

test("minutesLate counts whole minutes after the appointment", () => {
  assert.equal(minutesLate(at("10:00"), at("10:17")), 17);
});

test("arrival window classifies each case", () => {
  assert.equal(checkArrivalWindow(at("10:00"), at("09:00")).status, "too_early");
  assert.equal(checkArrivalWindow(at("10:00"), at("09:45")).status, "early");
  assert.equal(checkArrivalWindow(at("10:00"), at("10:08")).status, "on_time");
  const late = checkArrivalWindow(at("10:00"), at("10:25"));
  assert.equal(late.status, "late");
  assert.equal(late.withinWindow, false);
  assert.equal(late.minutesLate, 25);
});

test("grace period is configurable", () => {
  assert.equal(checkArrivalWindow(at("10:00"), at("10:12"), 30, 15).withinWindow, true);
  assert.equal(checkArrivalWindow(at("10:00"), at("10:12"), 30, 5).withinWindow, false);
});

test("expectedStart adds the doctor's delay", () => {
  assert.equal(expectedStart(at("10:00"), 20).toISOString(), at("10:20").toISOString());
  assert.equal(expectedStart(at("10:00"), -5).toISOString(), at("10:00").toISOString());
});
