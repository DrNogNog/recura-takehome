import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilter, buildReport, historyCsv, parseFilter } from "./history.js";
import type { Run } from "./types.js";

const run = (patch: Partial<Run>): Run => ({
  id: Math.random().toString(36).slice(2),
  ruleId: "r1",
  ruleName: "Glove watch",
  ownerId: "m1",
  trigger: "supply.low_stock",
  summary: "Gloves are low",
  test: false,
  status: "succeeded",
  startedAt: "2026-11-01T10:00:00.000Z",
  finishedAt: "2026-11-01T10:00:01.000Z",
  actions: [{ type: "notify", label: "Show a pop-up", ok: true, output: "Gloves low", sentTo: ["you", "Dr. Morgan Lee"] }],
  ...patch,
});

const runs = [
  run({ startedAt: "2026-11-01T12:00:00.000Z", trigger: "food.meal_skipped", ruleId: "r2", ruleName: "Skip watch", status: "failed", actions: [{ type: "ai", label: "Ask Claude (AI)", ok: false, output: "Connection error" }] }),
  run({ startedAt: "2026-11-01T11:00:00.000Z", test: true }),
  run({}),
];

test("filters leave out test runs unless asked, and narrow by part and result", () => {
  assert.equal(applyFilter(runs, {}).length, 2);
  assert.equal(applyFilter(runs, { includeTests: true }).length, 3);
  assert.equal(applyFilter(runs, { part: "food" }).length, 1);
  assert.equal(applyFilter(runs, { status: "failed" })[0].ruleName, "Skip watch");
  assert.deepEqual(parseFilter({ part: "nope", status: "weird", tests: "1" }), { part: undefined, status: undefined, includeTests: true });
});

test("the report totals runs, pop-ups, and Claude steps, by part and by automation", () => {
  const report = buildReport(applyFilter(runs, {}));
  assert.deepEqual(
    { runs: report.totals.runs, succeeded: report.totals.succeeded, failed: report.totals.failed, popups: report.totals.popups, aiSteps: report.totals.aiSteps },
    { runs: 2, succeeded: 1, failed: 1, popups: 2, aiSteps: 1 }
  );
  assert.equal(report.totals.lastRunAt, "2026-11-01T12:00:00.000Z");
  assert.deepEqual(report.byPart.map((p) => [p.part, p.runs, p.failed]), [["appointments", 0, 0], ["supplies", 1, 0], ["food", 1, 1]]);
  assert.deepEqual(report.byRule.map((r) => r.ruleName), ["Glove watch", "Skip watch"]);
});

test("the CSV has one row per run and quotes cells with commas", () => {
  const csv = historyCsv(applyFilter(runs, {})).split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[0], /^Started,Automation,Part,Trigger/);
  assert.match(csv[2], /"you, Dr. Morgan Lee"$/);
});
