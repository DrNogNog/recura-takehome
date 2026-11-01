import type { PortalName } from "../auth/middleware.js";
import type { EventData, TriggerType } from "./types.js";

export interface FieldDef {
  key: string;
  label: string;
  type: "number" | "text";
}

export interface TriggerDef {
  type: TriggerType;
  portal: PortalName;
  label: string;
  description: string;
  /** "owner": only the affected user's rules react. "portal": every rule in the portal reacts. */
  scope: "owner" | "portal";
  /** Event fields a rule can test in conditions and use as {{placeholders}}. */
  fields: FieldDef[];
  /** Example event used by Test run. */
  sample: EventData;
  summary: (d: EventData) => string;
}

const num = (key: string, label: string): FieldDef => ({ key, label, type: "number" });
const text = (key: string, label: string): FieldDef => ({ key, label, type: "text" });

const LIST: TriggerDef[] = [
  // ---------- Patient appointments ----------
  {
    type: "appointment.delayed",
    portal: "patient",
    label: "My appointment is running late",
    description: "The doctor reports a delay on the day of your appointment.",
    scope: "owner",
    fields: [num("delayMinutes", "Delay (minutes)"), text("doctorName", "Doctor"), text("scheduledTime", "Booked time"), text("expectedTime", "Expected time")],
    sample: { delayMinutes: 25, doctorName: "Dr. Morgan Lee", scheduledTime: "Tue 2:00 PM", expectedTime: "Tue 2:25 PM" },
    summary: (d) => `${d.doctorName} is running ${d.delayMinutes} min late; expected ${d.expectedTime}`,
  },
  {
    type: "appointment.checked_in",
    portal: "patient",
    label: "I check in",
    description: "You check in for your appointment.",
    scope: "owner",
    fields: [num("minutesLate", "Minutes late"), text("arrivalStatus", "Arrival (early, on time, late)"), text("doctorName", "Doctor"), text("scheduledTime", "Booked time")],
    sample: { minutesLate: 6, arrivalStatus: "on time", doctorName: "Dr. Morgan Lee", scheduledTime: "Tue 2:00 PM" },
    summary: (d) => `Checked in ${d.arrivalStatus} for ${d.scheduledTime} (${d.minutesLate} min late)`,
  },
  {
    type: "appointment.rescheduled",
    portal: "patient",
    label: "My appointment is rescheduled",
    description: "Your appointment moves to a new time.",
    scope: "owner",
    fields: [text("previousTime", "Previous time"), text("newTime", "New time"), text("doctorName", "Doctor")],
    sample: { previousTime: "Tue 2:00 PM", newTime: "Wed 10:30 AM", doctorName: "Dr. Morgan Lee" },
    summary: (d) => `Moved from ${d.previousTime} to ${d.newTime}`,
  },

  // ---------- Restock medical supplies (clinic-wide) ----------
  {
    type: "supply.low_stock",
    portal: "staff",
    label: "A supply runs low",
    description: "Stock drops to or below the item's reorder threshold.",
    scope: "portal",
    fields: [text("itemName", "Item"), num("quantity", "Quantity on hand"), num("reorderThreshold", "Reorder threshold"), text("location", "Location"), text("supplier", "Supplier"), text("unit", "Unit")],
    sample: { itemId: "sample", itemName: "Nitrile exam gloves (M)", quantity: 40, reorderThreshold: 100, unit: "gloves", location: "Exam Room A", supplier: "MedLine Direct" },
    summary: (d) => `${d.itemName} is down to ${d.quantity} ${d.unit} (threshold ${d.reorderThreshold}) in ${d.location}`,
  },
  {
    type: "supply.needs_sterilization",
    portal: "staff",
    label: "Equipment needs sterilizing",
    description: "Reusable equipment that must be sterilized after each use was used.",
    scope: "portal",
    fields: [text("itemName", "Item"), text("location", "Location"), text("lastUsedDate", "Last used")],
    sample: { itemId: "sample", itemName: "Stainless steel suture scissors", location: "Procedure Room", lastUsedDate: "2026-10-31" },
    summary: (d) => `${d.itemName} in ${d.location} was used on ${d.lastUsedDate} and needs sterilizing`,
  },

  // ---------- Food recommendations (per user) ----------
  {
    type: "food.meal_skipped",
    portal: "staff",
    label: "I skip a planned meal",
    description: "You log a planned meal as skipped.",
    scope: "owner",
    fields: [text("slot", "Meal (breakfast, lunch…)"), text("mealName", "Meal name"), text("date", "Date"), num("skippedThisWeek", "Meals skipped in the last 7 days")],
    sample: { slot: "breakfast", mealName: "Greek yogurt with berries", date: "2026-10-31", skippedThisWeek: 3 },
    summary: (d) => `Skipped ${d.slot} (${d.mealName}) on ${d.date}; ${d.skippedThisWeek} skipped this week`,
  },
  {
    type: "food.plan_over_budget",
    portal: "staff",
    label: "My meal plan goes over budget",
    description: "The coming week's planned meals cost more than your weekly budget allows.",
    scope: "owner",
    fields: [num("weekCost", "Planned cost this week ($)"), num("budget", "Budget for those days ($)"), num("overBy", "Over by ($)")],
    sample: { weekCost: 92.4, budget: 75, overBy: 17.4 },
    summary: (d) => `This week's meals cost $${d.weekCost}, $${d.overBy} over the $${d.budget} budget`,
  },
];

export const TRIGGERS = Object.fromEntries(LIST.map((t) => [t.type, t])) as Record<TriggerType, TriggerDef>;
export const triggersFor = (portal: PortalName) => LIST.filter((t) => t.portal === portal);
