import { randomUUID } from "node:crypto";
import { ACTIONS } from "./actions/index.js";
import { matches } from "./conditions.js";
import { subscribe, withoutEvents } from "./events.js";
import { TRIGGERS } from "./triggers.js";
import type { ActionResult, AutomationRepo, DomainEvent, Rule, Run } from "./types.js";

/**
 * The automation engine: for each published event, find the enabled rules for that
 * trigger, keep the ones whose conditions match and aren't cooling down, then run each
 * rule's actions in order and record the run.
 */
let repo: AutomationRepo;

export function startEngine(store: AutomationRepo) {
  repo = store;
  subscribe(dispatch);
}

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
    await execute(rule, event, false);
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

/**
 * Runs a rule's actions in order. Each action's output is handed to the next one, a failed
 * action is recorded and the rest still run, and nothing an action changes triggers more rules.
 */
export async function execute(rule: Rule, event: DomainEvent, test: boolean): Promise<Run> {
  const trigger = TRIGGERS[event.type];
  const startedAt = new Date().toISOString();
  const results: ActionResult[] = [];
  let previous: string | undefined;

  for (const step of rule.actions) {
    const handler = ACTIONS[step.type];
    try {
      const output = await withoutEvents(() => handler.run(step.params, { rule, event, trigger, previous, test }));
      results.push({ type: step.type, label: handler.label, ok: true, output });
      previous = output;
    } catch (e) {
      results.push({ type: step.type, label: handler.label, ok: false, output: e instanceof Error ? e.message : String(e) });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const run: Run = {
    id: randomUUID(),
    ruleId: rule.id,
    ruleName: rule.name,
    ownerId: rule.ownerId,
    trigger: event.type,
    summary: trigger.summary(event.data),
    test,
    status: failed === 0 ? "succeeded" : failed === results.length ? "failed" : "partial",
    startedAt,
    finishedAt: new Date().toISOString(),
    actions: results,
  };
  await repo.addRun(run);
  return run;
}
