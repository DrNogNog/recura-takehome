import type { PortalName } from "../../auth/middleware.js";
import type { TriggerDef } from "../triggers.js";
import type { ActionType, DomainEvent, Rule, TriggerType } from "../types.js";

export interface ParamDef {
  key: string;
  label: string;
  type: "text" | "longtext" | "number";
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface ActionContext {
  rule: Rule;
  event: DomainEvent;
  trigger: TriggerDef;
  /** Output of the previous action in the rule, if any. */
  previous?: string;
  /** Test runs use sample data; actions that change things only describe what they'd do. */
  test: boolean;
}

/** One kind of step a rule can run. `run` returns a line describing what it did. */
export interface ActionHandler {
  type: ActionType;
  label: string;
  description: string;
  portals: PortalName[];
  /** Only offered for these triggers (e.g. ordering needs a supply item). Unset = any trigger. */
  triggers?: TriggerType[];
  ai?: boolean;
  params: ParamDef[];
  run(params: Record<string, string | number>, ctx: ActionContext): Promise<string>;
}
