import { listDoctors } from "../auth/users.js";
import type { ChoiceOption } from "./actions/action.js";
import type { DomainEvent, Rule, TriggerType } from "./types.js";

const APPOINTMENT: TriggerType[] = ["appointment.delayed", "appointment.checked_in", "appointment.rescheduled"];
const SUPPLY: TriggerType[] = ["supply.low_stock", "supply.needs_sterilization"];

/**
 * Who a notification goes to. "The patient's doctor" comes from the appointment in the
 * event, so it's only offered for appointment triggers; "all doctors" for clinic supplies.
 */
export const RECIPIENTS: ChoiceOption[] = [
  { id: "me", label: "Me" },
  { id: "me_and_doctor", label: "Me and my doctor", triggers: APPOINTMENT },
  { id: "doctor", label: "My doctor", triggers: APPOINTMENT },
  { id: "me_and_doctors", label: "Me and all doctors", triggers: SUPPLY },
  { id: "doctors", label: "All doctors", triggers: SUPPLY },
];

export function resolveRecipients(choice: string, rule: Rule, event: DomainEvent): string[] {
  const ids: string[] = [];
  if (choice === "me" || choice.startsWith("me_and_")) ids.push(rule.ownerId);
  if ((choice === "doctor" || choice === "me_and_doctor") && event.data.doctorId) ids.push(String(event.data.doctorId));
  if (choice === "doctors" || choice === "me_and_doctors") ids.push(...listDoctors().map((d) => d.id));
  return [...new Set(ids)];
}
