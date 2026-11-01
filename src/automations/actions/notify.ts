import { render } from "../conditions.js";
import { RECIPIENTS, resolveRecipients } from "../recipients.js";
import type { ActionHandler } from "./action.js";

/** Pops up a message for the chosen people (you, your doctor, or all doctors). */
export const notify: ActionHandler = {
  type: "notify",
  label: "Show a pop-up",
  description: "Pops up a message under the navbar for you, your doctor, or every doctor. Use {{previous}} to include the step before it.",
  portals: ["patient", "staff"],
  params: [
    { key: "to", label: "Send to", type: "choice", options: RECIPIENTS },
    { key: "message", label: "Message", type: "longtext", maxLength: 500, placeholder: "e.g. {{itemName}} is low: {{previous}}" },
  ],
  async run(params, { rule, event, previous, deliver }) {
    const message = render(String(params.message), event.data, previous).trim();
    if (!message) throw new Error("The message came out empty");
    const sentTo = await deliver(resolveRecipients(String(params.to), rule, event), message);
    return { output: message, sentTo };
  },
};
