import type { PortalName } from "../auth/middleware.js";
import type { RuleInput } from "./types.js";

/** Ready-made rules shown as one-click starting points in the builder. */
const TEMPLATES: Record<PortalName, RuleInput[]> = {
  patient: [
    {
      name: "Heads-up when my doctor runs late",
      enabled: true,
      trigger: { type: "appointment.delayed", conditions: [{ field: "delayMinutes", op: "gte", value: 15 }] },
      actions: [
        { type: "ai", params: { instruction: "Write me a short, friendly note about the delay and suggest when to leave so I arrive just before {{expectedTime}}." } },
        { type: "notify", params: { message: "{{previous}}" } },
      ],
      cooldownMinutes: 60,
    },
    {
      name: "Confirm my new time",
      enabled: true,
      trigger: { type: "appointment.rescheduled", conditions: [] },
      actions: [{ type: "notify", params: { message: "Your appointment with {{doctorName}} moved from {{previousTime}} to {{newTime}}." } }],
      cooldownMinutes: 0,
    },
  ],
  staff: [
    {
      name: "Auto-reorder gloves",
      enabled: true,
      trigger: { type: "supply.low_stock", conditions: [{ field: "itemName", op: "contains", value: "glove" }] },
      actions: [
        { type: "supply.order", params: { quantity: 500 } },
        { type: "ai", params: { instruction: "In two sentences, tell the clinic manager what was reordered and whether the reorder threshold looks right." } },
        { type: "notify", params: { message: "{{previous}}" } },
      ],
      cooldownMinutes: 1440,
    },
    {
      name: "Sterilization reminder",
      enabled: true,
      trigger: { type: "supply.needs_sterilization", conditions: [] },
      actions: [{ type: "notify", params: { message: "Sterilize {{itemName}} in {{location}} before the next appointment." } }],
      cooldownMinutes: 0,
    },
    {
      name: "Adjust my plan after skipped meals",
      enabled: true,
      trigger: { type: "food.meal_skipped", conditions: [{ field: "skippedThisWeek", op: "gte", value: 3 }] },
      actions: [
        { type: "food.replan_tomorrow", params: {} },
        { type: "ai", params: { instruction: "I skipped {{slot}} again. Give me one practical, quick {{slot}} idea that fits a busy clinic shift." } },
        { type: "notify", params: { message: "{{previous}}" } },
      ],
      cooldownMinutes: 720,
    },
  ],
};

export const templatesFor = (portal: PortalName) => TEMPLATES[portal];
