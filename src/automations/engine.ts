import { randomUUID } from "node:crypto";
import { findUserById } from "../auth/users.js";
import { JobQueue } from "../lib/queue.js";
import { ACTIONS } from "./actions/index.js";
import { matches } from "./conditions.js";
import { subscribe, withoutEvents } from "./events.js";
import { TRIGGERS } from "./triggers.js";
import type { ActionResult, AutomationRepo, DomainEvent, Rule, Run } from "./types.js";

/**
 * The automation engine: for each event published on the bus, find the enabled rules for
 * that trigger, keep the ones whose conditions match and aren't cooling down, and queue a
 * run of each. A run executes the rule's actions in order, records the result, and always
 * ends with a pop-up for the rule's owner.
 */
let repo: AutomationRepo;

// Runs go through a queue so a burst of events is worked off in order without blocking
// requests. One attempt only: steps record their own failures, and a retry could order twice.
const runs = new JobQueue<{ rule: Rule; event: DomainEvent }>("automations", async ({ rule, event }) => void (await execute(rule, event, false)), 1);

export function startEngine(store: AutomationRepo) {
  repo = store;
  subscribe(dispatch);
}

export const queueStatus = () => runs.status();

async function dispatch(event: DomainEvent) {
  const trigger = TRIGGERS[event.type];
  const rules = (await repo.rulesForTrigger(event.type)).filter(
    (r) =>
      r.enabled &&
      r.portal === trigger.portal &&
      (trigger.scope === "portal" || r.ownerId === event.ownerId) &&
      matches(r.trigger.conditions, event.data)
  );
  for (const rule of rules) {
    if (coolingDown(rule, event)) continue;
    await repo.saveRule({ ...rule, lastFired: { ...recentFires(rule, event.at), [event.subject]: event.at } });
    runs.send({ rule, event });
  }
}

const cooldownMs = (rule: Rule) => rule.cooldownMinutes * 60_000;

function coolingDown(rule: Rule, event: DomainEvent) {
  const last = rule.lastFired[event.subject];
  return Boolean(last && Date.parse(event.at) - Date.parse(last) < cooldownMs(rule));
}

/** Drops cooldown entries that have expired, so `lastFired` doesn't grow forever. */
function recentFires(rule: Rule, now: string) {
  return Object.fromEntries(Object.entries(rule.lastFired).filter(([, at]) => Date.parse(now) - Date.parse(at) < cooldownMs(rule)));
}

const nameOf = (userId: string, rule: Rule) => (userId === rule.ownerId ? "you" : findUserById(userId)?.name ?? "a deleted account");

/**
 * Runs a rule's actions in order. Each action's output is handed to the next one, a failed
 * action is recorded and the rest still run, and nothing an action changes triggers more rules.
 * A real run (not a test) always pops up for the owner: if no step showed them anything,
 * the engine sends a summary of what ran.
 */
export async function execute(rule: Rule, event: DomainEvent, test: boolean): Promise<Run> {
  const trigger = TRIGGERS[event.type];
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const fromName = findUserById(rule.ownerId)?.name ?? "Someone";
  const notified = new Set<string>();

  // Test runs only ever reach the owner; nobody else gets a message from sample data.
  async function deliver(userIds: string[], message: string) {
    const names: string[] = [];
    for (const userId of new Set(userIds)) {
      if (test && userId !== rule.ownerId) {
        names.push(`${nameOf(userId, rule)} (test run, not sent)`);
        continue;
      }
      await repo.addNotification({ id: randomUUID(), userId, message, ruleName: rule.name, fromName, trigger: event.type, runId, at: new Date().toISOString() });
      notified.add(userId);
      names.push(nameOf(userId, rule));
    }
    return names;
  }

  const results: ActionResult[] = [];
  let previous: string | undefined;
  for (const step of rule.actions) {
    const handler = ACTIONS[step.type];
    try {
      const { output, sentTo } = await withoutEvents(() => handler.run(step.params, { rule, event, trigger, previous, test, deliver }));
      results.push({ type: step.type, label: handler.label, ok: true, output, sentTo });
      previous = output;
    } catch (e) {
      results.push({ type: step.type, label: handler.label, ok: false, output: e instanceof Error ? e.message : String(e) });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  if (!test && !notified.has(rule.ownerId)) {
    const steps = results.map((r) => `${r.label} ${r.ok ? "✓" : "✗"}`).join(", ");
    const message = `${trigger.summary(event.data)}. ${rule.name} ran: ${steps}.${failed ? " Open Activity to see what failed." : ""}`;
    results.push({ type: "notify", label: "Automatic pop-up", ok: true, output: message, sentTo: await deliver([rule.ownerId], message) });
  }

  const run: Run = {
    id: runId,
    ruleId: rule.id,
    ruleName: rule.name,
    ownerId: rule.ownerId,
    trigger: event.type,
    summary: trigger.summary(event.data),
    test,
    status: failed === 0 ? "succeeded" : failed === rule.actions.length ? "failed" : "partial",
    startedAt,
    finishedAt: new Date().toISOString(),
    actions: results,
  };
  await repo.addRun(run);
  return run;
}
