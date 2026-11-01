import type { PortalName } from "../../auth/middleware.js";
import type { TriggerDef } from "../triggers.js";
import type { ActionType, DomainEvent, Rule, TriggerType } from "../types.js";

/** One choice in a "choice" param. `triggers` limits it to events that carry what it needs. */
export interface ChoiceOption {
  id: string;
  label: string;
  triggers?: TriggerType[];
}

export interface ParamDef {
  key: string;
  label: string;
  type: "text" | "longtext" | "number" | "choice";
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: ChoiceOption[];
}

export interface ActionContext {
  rule: Rule;
  event: DomainEvent;
  trigger: TriggerDef;
  /** Output of the previous action in the rule, if any. */
  previous?: string;
  /** Test runs use sample data; actions that change things only describe what they'd do. */
  test: boolean;
  /** Pops up `message` for these people. Returns their names ("you", "Dr. Morgan Lee"). */
  deliver(userIds: string[], message: string): Promise<string[]>;
}

/** What a step did. `output` is shown in Activity and passed to the next step as {{previous}}. */
export interface ActionOutput {
  output: string;
  sentTo?: string[];
}

/** One kind of step a rule can run. */
export interface ActionHandler {
  type: ActionType;
  label: string;
  description: string;
  portals: PortalName[];
  /** Only offered for these triggers (e.g. ordering needs a supply item). Unset = any trigger. */
  triggers?: TriggerType[];
  ai?: boolean;
  params: ParamDef[];
  run(params: Record<string, string | number>, ctx: ActionContext): Promise<ActionOutput>;
}

/** The choices of a param that fit this trigger. */
export const optionsFor = (param: ParamDef, trigger: TriggerType) =>
  (param.options ?? []).filter((o) => !o.triggers || o.triggers.includes(trigger));
