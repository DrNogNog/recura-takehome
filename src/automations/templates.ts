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
        {
          type: "ai",
          params: {
            instruction: "Write a short, friendly note about the delay: when to leave so I arrive just before {{expectedTime}}, and that {{doctorName}} knows I'm aware.",
            to: "me_and_doctor",
          },
        },
      ],
      cooldownMinutes: 60,
    },
    {
      name: "Tell my doctor when I check in",
      enabled: true,
      trigger: { type: "appointment.checked_in", conditions: [] },
      actions: [
        { type: "ai", params: { instruction: "Write a one-line check-in note for {{doctorName}}: I arrived {{arrivalStatus}} for {{scheduledTime}}.", to: "me_and_doctor" } },
      ],
      cooldownMinutes: 0,
    },
    {
      name: "Confirm my new time",
      enabled: true,
      trigger: { type: "appointment.rescheduled", conditions: [] },
      actions: [{ type: "notify", params: { to: "me_and_doctor", message: "Appointment with {{doctorName}} moved from {{previousTime}} to {{newTime}}." } }],
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
        { type: "ai", params: { instruction: "In two sentences, tell the doctors what was reordered ({{previous}}) and whether the reorder threshold looks right.", to: "me_and_doctors" } },
      ],
      cooldownMinutes: 1440,
    },
    {
      name: "Sterilize and keep a spare",
      enabled: true,
      trigger: { type: "supply.needs_sterilization", conditions: [] },
      actions: [
        { type: "ai", params: { instruction: "Remind the doctors to sterilize {{itemName}} in {{location}} before the next appointment.", to: "me_and_doctors" } },
        { type: "supply.order", params: { quantity: 1 } },
      ],
      cooldownMinutes: 0,
    },
    {
      name: "Adjust my plan after skipped meals",
      enabled: true,
      trigger: { type: "food.meal_skipped", conditions: [{ field: "skippedThisWeek", op: "gte", value: 3 }] },
      actions: [
        { type: "ai", params: { instruction: "I skipped {{slot}} again. Give me one practical, quick {{slot}} idea that fits a busy clinic shift.", to: "me" } },
        { type: "food.replan_tomorrow", params: {} },
      ],
      cooldownMinutes: 720,
    },
  ],
};

export const templatesFor = (portal: PortalName) => TEMPLATES[portal];
