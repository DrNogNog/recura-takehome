import type { PortalName } from "../auth/middleware.js";
import { HttpError } from "../lib/http.js";
import { ACTIONS } from "./actions/index.js";
import { TRIGGERS } from "./triggers.js";
import type { ActionStep, Condition, Operator, RuleInput, TriggerType } from "./types.js";

const MAX_CONDITIONS = 5;
const MAX_ACTIONS = 5;
const NUMBER_OPS: Operator[] = ["gt", "gte", "lt", "lte", "eq"];
const TEXT_OPS: Operator[] = ["eq", "contains"];

const bad = (message: string): never => {
  throw new HttpError(400, message);
};
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks a rule from the browser against the portal's triggers and actions. */
export function parseRule(body: unknown, portal: PortalName): RuleInput {
  if (!isObject(body)) bad("Send the automation as a JSON object");
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 80) bad("Give the automation a name (up to 80 characters)");

  if (!isObject(b.trigger)) bad("Choose a trigger");
  const t = b.trigger as Record<string, unknown>;
  const trigger = TRIGGERS[t.type as TriggerType];
  if (!trigger || trigger.portal !== portal) bad("That trigger isn't available for your account");

  const rawConditions = t.conditions ?? [];
  if (!Array.isArray(rawConditions) || rawConditions.length > MAX_CONDITIONS) bad(`Use up to ${MAX_CONDITIONS} conditions`);
  const conditions = (rawConditions as unknown[]).map((c, i) => parseCondition(c, i + 1, trigger.type));

  if (!Array.isArray(b.actions) || b.actions.length === 0) bad("Add at least one action");
  if ((b.actions as unknown[]).length > MAX_ACTIONS) bad(`Use up to ${MAX_ACTIONS} actions`);
  const actions = (b.actions as unknown[]).map((a, i) => parseAction(a, i + 1, trigger.type, portal));

  const cooldown = b.cooldownMinutes ?? 60;
  if (typeof cooldown !== "number" || !Number.isInteger(cooldown) || cooldown < 0 || cooldown > 10_080) {
    bad("Cooldown must be a whole number of minutes from 0 to 10080 (one week)");
  }

  return {
    name,
    enabled: b.enabled === undefined ? true : b.enabled === true,
    trigger: { type: trigger.type, conditions },
    actions,
    cooldownMinutes: cooldown as number,
  };
}

function parseCondition(raw: unknown, n: number, type: TriggerType): Condition {
  if (!isObject(raw)) bad(`Condition ${n} is incomplete`);
  const c = raw as Record<string, unknown>;
  const field = TRIGGERS[type].fields.find((f) => f.key === c.field);
  if (!field) bad(`Condition ${n}: pick a field this trigger has`);
  const op = c.op as Operator;
  if (!(field!.type === "number" ? NUMBER_OPS : TEXT_OPS).includes(op)) bad(`Condition ${n}: that comparison doesn't fit ${field!.label}`);
  if (field!.type === "number") {
    const value = typeof c.value === "string" && c.value.trim() !== "" ? Number(c.value) : c.value;
    if (typeof value !== "number" || !Number.isFinite(value)) bad(`Condition ${n}: ${field!.label} needs a number`);
    return { field: field!.key, op, value: value as number };
  }
  const value = typeof c.value === "string" ? c.value.trim() : "";
  if (!value || value.length > 100) bad(`Condition ${n}: enter a value (up to 100 characters)`);
  return { field: field!.key, op, value };
}

function parseAction(raw: unknown, n: number, type: TriggerType, portal: PortalName): ActionStep {
  if (!isObject(raw)) bad(`Action ${n} is incomplete`);
  const a = raw as Record<string, unknown>;
  const handler = ACTIONS[a.type as ActionStep["type"]];
  if (!handler || !handler.portals.includes(portal)) bad(`Action ${n} isn't available for your account`);
  if (handler.triggers && !handler.triggers.includes(type)) bad(`"${handler.label}" can't run for this trigger`);
  const given = isObject(a.params) ? (a.params as Record<string, unknown>) : {};

  const params: ActionStep["params"] = {};
  for (const p of handler.params) {
    const v = given[p.key];
    if (p.type === "number") {
      const num = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof num !== "number" || !Number.isFinite(num) || num < (p.min ?? -Infinity) || num > (p.max ?? Infinity)) {
        bad(`Action ${n}: ${p.label} must be a number${p.min !== undefined ? ` from ${p.min} to ${p.max}` : ""}`);
      }
      params[p.key] = num as number;
    } else {
      const text = typeof v === "string" ? v.trim() : "";
      if (!text || text.length > (p.maxLength ?? 500)) bad(`Action ${n}: fill in ${p.label} (up to ${p.maxLength ?? 500} characters)`);
      params[p.key] = text;
    }
  }
  return { type: handler.type, params };
}
