import { randomUUID } from "node:crypto";
import type { AuthUser } from "../auth/middleware.js";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { actionsFor } from "./actions/index.js";
import { execute, queueStatus, startEngine } from "./engine.js";
import { applyFilter, buildReport, historyCsv, type HistoryFilter } from "./history.js";
import { FileAutomationRepo, PostgresAutomationRepo } from "./repos.js";
import { templatesFor } from "./templates.js";
import { TRIGGERS, triggersFor } from "./triggers.js";
import type { AutomationRepo, Rule } from "./types.js";
import { parseRule } from "./validate.js";

const MAX_RULES_PER_USER = 20;

let repo: AutomationRepo;

export async function initAutomations() {
  repo = config.automationsStore === "external" ? await PostgresAutomationRepo.connect() : new FileAutomationRepo();
  startEngine(repo);
}

/** What the builder offers this account: its triggers, actions, and templates. */
export function catalog(user: AuthUser) {
  return {
    aiEnabled: config.anthropicEnabled,
    triggers: triggersFor(user.portal).map(({ summary: _s, sample: _x, ...t }) => t),
    actions: actionsFor(user.portal).map(({ run: _r, ...a }) => a),
    templates: templatesFor(user.portal),
  };
}

/** Rules as the browser sees them (cooldown bookkeeping left out). */
const view = ({ lastFired, ...rule }: Rule) => ({ ...rule, lastRunAt: Object.values(lastFired).sort().at(-1) ?? null });

async function owned(user: AuthUser, id: string) {
  const rule = await repo.getRule(id);
  if (!rule || rule.ownerId !== user.id) throw new HttpError(404, "Automation not found");
  return rule;
}

export async function listRules(user: AuthUser) {
  return (await repo.listRules(user.id)).map(view);
}

export async function createRule(user: AuthUser, body: unknown) {
  const input = parseRule(body, user.portal);
  if ((await repo.listRules(user.id)).length >= MAX_RULES_PER_USER) {
    throw new HttpError(409, `You can have up to ${MAX_RULES_PER_USER} automations. Delete one first.`);
  }
  const now = new Date().toISOString();
  const rule: Rule = { ...input, id: randomUUID(), ownerId: user.id, portal: user.portal, lastFired: {}, createdAt: now, updatedAt: now };
  await repo.saveRule(rule);
  return view(rule);
}

/** Updates a rule. Fields left out keep their current values (so `{ enabled }` alone toggles it). */
export async function updateRule(user: AuthUser, id: string, body: unknown) {
  const rule = await owned(user, id);
  const current = { name: rule.name, enabled: rule.enabled, trigger: rule.trigger, actions: rule.actions, cooldownMinutes: rule.cooldownMinutes };
  const input = parseRule({ ...current, ...(typeof body === "object" && body ? body : {}) }, user.portal);
  const triggerChanged = input.trigger.type !== rule.trigger.type;
  const updated: Rule = { ...rule, ...input, lastFired: triggerChanged ? {} : rule.lastFired, updatedAt: new Date().toISOString() };
  await repo.saveRule(updated);
  return view(updated);
}

export async function deleteRule(user: AuthUser, id: string) {
  await owned(user, id);
  await repo.deleteRule(id);
}

/** Runs a rule now with the trigger's sample event. Actions that change things only describe it. */
export async function testRule(user: AuthUser, id: string) {
  const rule = await owned(user, id);
  const trigger = TRIGGERS[rule.trigger.type];
  return execute(rule, { type: trigger.type, ownerId: user.id, subject: "test", data: trigger.sample, at: new Date().toISOString() }, true);
}

export const listRuns = (user: AuthUser) => repo.runs(user.id, 50);

const HISTORY_LIMIT = 500;

/** The History report: every past run of this account's automations, filtered. */
export async function history(user: AuthUser, filter: HistoryFilter) {
  return buildReport(applyFilter(await repo.runs(user.id, HISTORY_LIMIT), filter));
}

export async function historyAsCsv(user: AuthUser, filter: HistoryFilter) {
  return historyCsv(applyFilter(await repo.runs(user.id, HISTORY_LIMIT), filter));
}

/** Pop-ups for this account (from its own automations or someone else's), optionally only newer than `since`. */
export async function listInbox(user: AuthUser, since?: string) {
  const all = await repo.notifications(user.id, 50);
  return since ? all.filter((n) => n.at > since) : all;
}

export { queueStatus };
