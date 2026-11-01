import { test } from "node:test";
import assert from "node:assert/strict";
import { matches, render } from "./conditions.js";
import { startEngine } from "./engine.js";
import { emit, withoutEvents } from "./events.js";
import { parseRule } from "./validate.js";
import type { AutomationRepo, Notification, Rule, Run, TriggerType } from "./types.js";

// ---------- Conditions and templates ----------

test("conditions compare numbers and match text without case", () => {
  const data = { delayMinutes: 20, doctorName: "Dr. Morgan Lee" };
  assert.equal(matches([{ field: "delayMinutes", op: "gte", value: 15 }], data), true);
  assert.equal(matches([{ field: "delayMinutes", op: "lt", value: 15 }], data), false);
  assert.equal(matches([{ field: "doctorName", op: "contains", value: "morgan" }], data), true);
  assert.equal(matches([{ field: "doctorName", op: "eq", value: "dr. morgan lee" }], data), true);
  assert.equal(matches([], data), true);
  assert.equal(matches([{ field: "missing", op: "eq", value: 1 }], data), false);
});

test("templates fill event fields and the previous step's output", () => {
  assert.equal(render("{{itemName}} low: {{previous}}", { itemName: "Gloves" }, "ordered 300"), "Gloves low: ordered 300");
  assert.equal(render("{{ unknown }} stays", {}), "{{ unknown }} stays");
});

// ---------- Validation ----------

const valid = {
  name: "Late heads-up",
  trigger: { type: "appointment.delayed", conditions: [{ field: "delayMinutes", op: "gte", value: "15" }] },
  actions: [{ type: "notify", params: { to: "me_and_doctor", message: "Running {{delayMinutes}} min late" } }],
  cooldownMinutes: 30,
};

test("a valid rule is cleaned up (numbers parsed, enabled by default)", () => {
  const rule = parseRule(valid, "patient");
  assert.deepEqual(rule.trigger.conditions[0], { field: "delayMinutes", op: "gte", value: 15 });
  assert.equal(rule.enabled, true);
});

test("validation rejects triggers, actions, and fields from the wrong place", () => {
  assert.throws(() => parseRule(valid, "staff"), /trigger isn't available/);
  assert.throws(() => parseRule({ ...valid, actions: [] }, "patient"), /at least one action/);
  assert.throws(() => parseRule({ ...valid, actions: [{ type: "supply.order", params: { quantity: 5 } }] }, "patient"), /isn't available/);
  assert.throws(
    () => parseRule({ ...valid, trigger: { type: "appointment.delayed", conditions: [{ field: "delayMinutes", op: "contains", value: "1" }] } }, "patient"),
    /doesn't fit/
  );
  assert.throws(() => parseRule({ ...valid, actions: [{ type: "notify", params: { to: "me", message: "  " } }] }, "patient"), /fill in Message/);
});

test("recipients must fit the trigger, and older rules default to sending to me", () => {
  // "All doctors" is for clinic supplies, not a patient's appointment.
  assert.throws(() => parseRule({ ...valid, actions: [{ type: "notify", params: { to: "doctors", message: "hi" } }] }, "patient"), /pick Send to/);
  const old = parseRule({ ...valid, actions: [{ type: "notify", params: { message: "hi" } }] }, "patient");
  assert.equal(old.actions[0].params.to, "me");
});

test("ordering stock is only allowed for supply triggers", () => {
  const order = { type: "supply.order", params: { quantity: 100 } };
  assert.ok(parseRule({ ...valid, trigger: { type: "supply.low_stock", conditions: [] }, actions: [order] }, "staff"));
  assert.ok(parseRule({ ...valid, trigger: { type: "supply.needs_sterilization", conditions: [] }, actions: [order] }, "staff"));
  assert.throws(() => parseRule({ ...valid, trigger: { type: "food.meal_skipped", conditions: [] }, actions: [order] }, "staff"), /can't run for this trigger/);
});

// ---------- Engine ----------

class FakeRepo implements AutomationRepo {
  rules: Rule[] = [];
  runList: Run[] = [];
  inbox: Notification[] = [];
  async listRules(ownerId: string) {
    return this.rules.filter((r) => r.ownerId === ownerId);
  }
  async getRule(id: string) {
    return this.rules.find((r) => r.id === id);
  }
  async rulesForTrigger(type: TriggerType) {
    return this.rules.filter((r) => r.trigger.type === type);
  }
  async saveRule(rule: Rule) {
    this.rules = [...this.rules.filter((r) => r.id !== rule.id), rule];
  }
  async deleteRule(id: string) {
    this.rules = this.rules.filter((r) => r.id !== id);
  }
  async addRun(run: Run) {
    this.runList.push(run);
  }
  async runs(ownerId: string) {
    return this.runList.filter((r) => r.ownerId === ownerId);
  }
  async addNotification(n: Notification) {
    this.inbox.push(n);
  }
  async notifications(userId: string) {
    return this.inbox.filter((n) => n.userId === userId);
  }
}

const rule = (patch: Partial<Rule>): Rule => ({
  id: "r1",
  ownerId: "p1",
  portal: "patient",
  name: "Late",
  enabled: true,
  trigger: { type: "appointment.delayed", conditions: [{ field: "delayMinutes", op: "gte", value: 15 }] },
  actions: [
    { type: "notify", params: { to: "me", message: "{{doctorName}} is {{delayMinutes}} min late" } },
    { type: "notify", params: { to: "me_and_doctor", message: "Again: {{previous}}" } },
  ],
  cooldownMinutes: 60,
  lastFired: {},
  createdAt: "",
  updatedAt: "",
  ...patch,
});

const repo = new FakeRepo();
startEngine(repo);
const settle = () => new Promise((r) => setTimeout(r, 30));
const delay = (ownerId: string, minutes: number, subject = "appt-1") =>
  emit("appointment.delayed", { ownerId, subject, data: { delayMinutes: minutes, doctorId: "d1", doctorName: "Dr. Lee", scheduledTime: "2 PM", expectedTime: "2:20 PM" } });
const reset = (rules: Rule[]) => {
  repo.rules = rules;
  repo.runList = [];
  repo.inbox = [];
};

test("a matching event runs the actions in order and delivers each notification", async () => {
  reset([rule({})]);
  delay("p1", 20);
  await settle();
  assert.equal(repo.runList.length, 1);
  assert.deepEqual(repo.runList[0].actions.map((a) => a.output), ["Dr. Lee is 20 min late", "Again: Dr. Lee is 20 min late"]);
  assert.equal(repo.runList[0].status, "succeeded");
  // The patient got both messages; their doctor got the second.
  assert.deepEqual(repo.inbox.filter((n) => n.userId === "p1").map((n) => n.message), ["Dr. Lee is 20 min late", "Again: Dr. Lee is 20 min late"]);
  assert.deepEqual(repo.inbox.filter((n) => n.userId === "d1").map((n) => n.message), ["Again: Dr. Lee is 20 min late"]);
  assert.equal(repo.inbox[0].fromName, "Alex Rivera");
});

test("every run from the bus notifies the owner, even when no step sent them anything", async () => {
  reset([rule({ actions: [{ type: "notify", params: { to: "doctor", message: "Patient knows you're late" } }] })]);
  delay("p1", 20);
  await settle();
  const toPatient = repo.inbox.filter((n) => n.userId === "p1");
  assert.equal(toPatient.length, 1);
  assert.match(toPatient[0].message, /Dr\. Lee is running 20 min late.*Late ran: Show a pop-up ✓/);
  assert.equal(repo.runList[0].actions.at(-1)?.label, "Automatic pop-up");
  assert.equal(repo.inbox.filter((n) => n.userId === "d1").length, 1);
});

test("rules skip events that fail conditions, belong to others, or are cooling down", async () => {
  reset([rule({})]);
  delay("p1", 5); // condition fails
  delay("p2", 30); // someone else's appointment
  await settle();
  assert.equal(repo.runList.length, 0);

  delay("p1", 30);
  await settle();
  delay("p1", 30); // same appointment within the cooldown
  await settle();
  delay("p1", 30, "appt-2"); // a different appointment isn't cooling down
  await settle();
  assert.equal(repo.runList.length, 2);
});

test("disabled rules don't run, and actions' own changes publish no events", async () => {
  reset([rule({ enabled: false }), rule({ id: "r2", cooldownMinutes: 0 })]);
  await withoutEvents(async () => delay("p1", 30));
  await settle();
  assert.equal(repo.runList.length, 0);
  delay("p1", 30);
  await settle();
  assert.deepEqual(repo.runList.map((r) => r.ruleId), ["r2"]);
});
