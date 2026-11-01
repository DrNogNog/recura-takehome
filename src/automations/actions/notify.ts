import { render } from "../conditions.js";
import type { ActionHandler } from "./action.js";

/** Posts a message to the rule owner's Activity feed. */
export const notify: ActionHandler = {
  type: "notify",
  label: "Send me a notification",
  description: "Adds a message to your Activity feed. Use {{previous}} to include the step before it, like Claude's reply.",
  portals: ["patient", "staff"],
  params: [{ key: "message", label: "Message", type: "longtext", maxLength: 500, placeholder: "e.g. {{itemName}} is low: {{previous}}" }],
  async run(params, { event, previous }) {
    const message = render(String(params.message), event.data, previous).trim();
    if (!message) throw new Error("The message came out empty");
    return message;
  },
};
