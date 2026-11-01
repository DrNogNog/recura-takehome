/** Shapes returned by /api/automations (see src/automations on the server). */

export type Operator = "gt" | "gte" | "lt" | "lte" | "eq" | "contains";

export interface FieldDef {
  key: string;
  label: string;
  type: "number" | "text";
}

export interface TriggerDef {
  type: string;
  label: string;
  description: string;
  scope: "owner" | "portal";
  fields: FieldDef[];
}

export interface ChoiceOption {
  id: string;
  label: string;
  triggers?: string[];
}

export interface ParamDef {
  key: string;
  label: string;
  type: "text" | "longtext" | "number" | "choice";
  options?: ChoiceOption[];
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface ActionDef {
  type: string;
  label: string;
  description: string;
  triggers?: string[];
  ai?: boolean;
  params: ParamDef[];
}

export interface Condition {
  field: string;
  op: Operator;
  value: string | number;
}

export interface ActionStep {
  type: string;
  params: Record<string, string | number>;
}

export interface RuleInput {
  name: string;
  enabled: boolean;
  trigger: { type: string; conditions: Condition[] };
  actions: ActionStep[];
  cooldownMinutes: number;
}

export interface Rule extends RuleInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
}

export interface Catalog {
  aiEnabled: boolean;
  triggers: TriggerDef[];
  actions: ActionDef[];
  templates: RuleInput[];
}

export interface Run {
  id: string;
  ruleId: string;
  ruleName: string;
  summary: string;
  test: boolean;
  status: "succeeded" | "partial" | "failed";
  startedAt: string;
  actions: Array<{ type: string; label: string; ok: boolean; output: string; sentTo?: string[] }>;
}

export interface Notification {
  id: string;
  message: string;
  ruleName: string;
  fromName: string;
  at: string;
}

export const OPERATORS: Record<Operator, string> = {
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  eq: "is",
  contains: "contains",
};
export const opsFor = (field?: FieldDef): Operator[] => (field?.type === "number" ? ["gte", "gt", "lte", "lt", "eq"] : ["contains", "eq"]);

/** The choices of a param that fit this trigger (e.g. "My doctor" only for appointments). */
export const optionsFor = (param: ParamDef, triggerType: string) =>
  (param.options ?? []).filter((o) => !o.triggers || o.triggers.includes(triggerType));

/** Actions a trigger can use (some, like ordering stock, only fit certain triggers). */
export const actionsForTrigger = (catalog: Catalog, triggerType: string) =>
  catalog.actions.filter((a) => !a.triggers || a.triggers.includes(triggerType));
