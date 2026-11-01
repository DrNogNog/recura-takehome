import { orderSupply } from "../../supplies/service.js";
import type { ActionHandler } from "./action.js";

/** Orders more of the supply that ran low. */
export const supplyOrder: ActionHandler = {
  type: "supply.order",
  label: "Order more stock",
  description: "Orders a set quantity of the item that ran low and records it in the supply history.",
  portals: ["staff"],
  triggers: ["supply.low_stock"],
  params: [{ key: "quantity", label: "Quantity to order", type: "number", min: 1, max: 100_000 }],
  async run(params, { event, rule, test }) {
    const qty = Number(params.quantity);
    const { itemId, itemName, unit } = event.data;
    if (test) return `Test run: would order ${qty} ${unit} of ${itemName}.`;
    const item = await orderSupply(String(itemId), qty, undefined, `Automation: ${rule.name}`);
    return `Ordered ${qty} ${item.unit} of ${item.name}; ${item.quantity} on hand now.`;
  },
};
