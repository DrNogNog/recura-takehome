import { fillPlan, resolveToday } from "../../food/service.js";
import type { ActionHandler } from "./action.js";

const tomorrow = (today: string) => new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Re-plans tomorrow's meals with the user's current settings and eating habits. */
export const foodReplan: ActionHandler = {
  type: "food.replan_tomorrow",
  label: "Re-plan tomorrow's meals",
  description: "Replaces tomorrow's plan using your settings and the meals you've been eating or skipping.",
  portals: ["staff"],
  triggers: ["food.meal_skipped", "food.plan_over_budget"],
  params: [],
  async run(_params, { rule, test }) {
    const today = resolveToday();
    const date = tomorrow(today);
    if (test) return { output: `Test run: would re-plan meals for ${date}.` };
    const month = await fillPlan(rule.ownerId, { date }, today);
    const day = month.days[date];
    return {
      output: day ? `Re-planned ${date}: ${day.meals.length} meals, ${Math.round(day.nutrients.calories)} kcal, $${day.cost}.` : `Re-planned ${date}.`,
    };
  },
};
