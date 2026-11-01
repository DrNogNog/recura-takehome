import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import { render } from "../conditions.js";
import { RECIPIENTS, resolveRecipients } from "../recipients.js";
import type { ActionContext, ActionHandler } from "./action.js";

let client: Anthropic | undefined;

const SYSTEM =
  "You are the automation assistant inside Recura, a clinic portal. An automation rule just fired. " +
  "Follow the user's instruction using only the event details provided; don't invent facts, prices, or medical advice beyond them. " +
  "Reply in plain text (no markdown), under 120 words, ready to show in a notification.";

/** AI step: Claude writes a note, summary, or suggestion from the event details. */
export const ai: ActionHandler = {
  type: "ai",
  label: "Ask Claude (AI)",
  description: "Claude writes a message, summary, or suggestion from the event and pops it up for the people you pick. The next step can use its reply as {{previous}}.",
  portals: ["patient", "staff"],
  ai: true,
  params: [
    {
      key: "instruction",
      label: "What should Claude do?",
      type: "longtext",
      maxLength: 500,
      placeholder: "e.g. Write a two-sentence note for the manager about this and suggest a fix.",
    },
    { key: "to", label: "Pop up Claude's reply for", type: "choice", options: [...RECIPIENTS, { id: "none", label: "No one (only pass it to the next step)" }] },
  ],
  async run(params, { rule, event, trigger, previous, deliver }) {
    const text = await reply(String(params.instruction), { event, trigger, previous });
    const to = String(params.to ?? "none");
    if (to === "none") return { output: text };
    return { output: text, sentTo: await deliver(resolveRecipients(to, rule, event), text) };
  },
};

/** Claude's reply, or a plain summary when no Anthropic key is set. */
async function reply(instructionTemplate: string, { event, trigger, previous }: Pick<ActionContext, "event" | "trigger" | "previous">) {
  const instruction = render(instructionTemplate, event.data, previous);
  if (!config.anthropicEnabled) {
    return `${trigger.summary(event.data)}. (Claude is off: add ANTHROPIC_API_KEY to .env for an AI-written reply.)`;
  }
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          instruction,
          event: trigger.label,
          summary: trigger.summary(event.data),
          details: event.data,
          previousStepOutput: previous ?? null,
        }),
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request");
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude returned an empty reply");
  return text;
}
