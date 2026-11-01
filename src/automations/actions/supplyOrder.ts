import { orderSupply } from "../../supplies/service.js";
import type { ActionHandler } from "./action.js";

/** Orders more of the supply in the event (it ran low, or spares while one is sterilized). */
export const supplyOrder: ActionHandler = {
  type: "supply.order",
  label: "Order more stock",
  description: "Orders a set quantity of the item (more stock, or spares while one is being sterilized) and records it in the supply history.",
  portals: ["staff"],
  triggers: ["supply.low_stock", "supply.needs_sterilization"],
  params: [{ key: "quantity", label: "Quantity to order", type: "number", min: 1, max: 100_000 }],
  async run(params, { event, rule, test }) {
    const qty = Number(params.quantity);
    const { itemId, itemName, unit } = event.data;
    if (test) return { output: `Test run: would order ${qty} ${unit} of ${itemName}.` };
    const item = await orderSupply(String(itemId), qty, undefined, `Automation: ${rule.name}`);
    return { output: `Ordered ${qty} ${item.unit} of ${item.name}; ${item.quantity} on hand now.` };
  },
};
