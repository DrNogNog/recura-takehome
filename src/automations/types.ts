import type { PortalName } from "../auth/middleware.js";

/** Something that happened in one of the workflows, which a rule can react to. */
export type TriggerType =
  | "appointment.delayed"
  | "appointment.checked_in"
  | "appointment.rescheduled"
  | "supply.low_stock"
  | "supply.needs_sterilization"
  | "food.meal_skipped"
  | "food.plan_over_budget";

export type ActionType = "notify" | "ai" | "supply.order" | "food.replan_tomorrow";

export type EventData = Record<string, string | number>;

export interface DomainEvent {
  type: TriggerType;
  /** Whose rules may react. Unset for clinic-wide events (every staff rule may react). */
  ownerId?: string;
  /** What the event is about (an item, an appointment); cooldowns are per subject. */
  subject: string;
  data: EventData;
  at: string;
}

export type Operator = "gt" | "gte" | "lt" | "lte" | "eq" | "contains";

export interface Condition {
  field: string;
  op: Operator;
  value: string | number;
}

export interface ActionStep {
  type: ActionType;
  params: Record<string, string | number>;
}

export interface Rule {
  id: string;
  ownerId: string;
  portal: PortalName;
  name: string;
  enabled: boolean;
  trigger: { type: TriggerType; conditions: Condition[] };
  actions: ActionStep[];
  /** Don't fire again for the same subject within this many minutes (0 = every time). */
  cooldownMinutes: number;
  /** Last time the rule fired, per subject (for the cooldown). */
  lastFired: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** The fields a user sets when creating or editing a rule. */
export type RuleInput = Pick<Rule, "name" | "enabled" | "trigger" | "actions" | "cooldownMinutes">;

export interface ActionResult {
  type: ActionType;
  label: string;
  ok: boolean;
  output: string;
}

export interface Run {
  id: string;
  ruleId: string;
  ruleName: string;
  ownerId: string;
  trigger: TriggerType;
  summary: string;
  test: boolean;
  status: "succeeded" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  actions: ActionResult[];
}

export interface AutomationRepo {
  listRules(ownerId: string): Promise<Rule[]>;
  getRule(id: string): Promise<Rule | undefined>;
  rulesForTrigger(type: TriggerType): Promise<Rule[]>;
  saveRule(rule: Rule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  addRun(run: Run): Promise<void>;
  runs(ownerId: string, limit: number): Promise<Run[]>;
}
