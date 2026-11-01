import type { PortalName } from "../../auth/middleware.js";
import type { ActionType } from "../types.js";
import type { ActionHandler } from "./action.js";
import { ai } from "./ai.js";
import { foodReplan } from "./foodReplan.js";
import { notify } from "./notify.js";
import { supplyOrder } from "./supplyOrder.js";

export type { ActionContext, ActionHandler, ActionOutput, ChoiceOption, ParamDef } from "./action.js";
export { optionsFor } from "./action.js";

/** Every action a rule can run. Add a new kind of step by adding a handler here. */
const LIST: ActionHandler[] = [ai, notify, supplyOrder, foodReplan];

export const ACTIONS = Object.fromEntries(LIST.map((a) => [a.type, a])) as Record<ActionType, ActionHandler>;
export const actionsFor = (portal: PortalName) => LIST.filter((a) => a.portals.includes(portal));
