import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";
import type { FoodItem, MealSlot, PlanDay, PlanSettings } from "./types.js";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const SLOT_SHARE: Record<MealSlot, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

const PlanSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      meals: z.array(
        z.object({
          slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
          name: z.string(),
          ingredients: z.array(z.object({ itemId: z.string(), servings: z.number() })),
        })
      ),
    })
  ),
  notes: z.string(),
});

let client: Anthropic | undefined;

/**
 * RAG meal planning: the caller retrieves candidate market items (from search),
 * Claude picks meals using only those item ids, and the app then computes
 * calories, cost, and nutrients itself from the stored item data, so the numbers
 * are never made up by the model.
 */
export async function planWithClaude(
  dates: string[],
  settings: PlanSettings,
  candidates: FoodItem[],
  habitsSummary: string
): Promise<{ days: PlanDay[]; notes: string }> {
  client ??= new Anthropic();
  const catalog = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    serving: c.servingSize,
    price: c.price,
    kcal: c.nutrients.calories,
    protein: c.nutrients.protein,
    tags: c.tags,
  }));

  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(PlanSchema) },
    system:
      "You plan practical home-cooked meals from a local market's current items. " +
      "Use only item ids from the catalog. Return one entry per date in planDates. Servings can be fractional. Vary meals across days, " +
      "hit the daily calorie target within about 10%, stay under the budget, and favor fiber, " +
      "protein, and produce. Keep `notes` to two or three sentences of practical advice.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          planDates: dates,
          dailyCalories: settings.dailyCalories,
          budgetForTheseDays: +((settings.weeklyBudget / 7) * dates.length).toFixed(2),
          preferences: settings.preferences,
          requiredTags: settings.tags,
          recentEatingHabits: habitsSummary,
          catalog,
        }),
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Claude did not return a meal plan");
  }
  const known = new Set(candidates.map((c) => c.id));
  const days = response.parsed_output.days
    .filter((d) => dates.includes(d.date))
    .map((d) => ({
      date: d.date,
      meals: d.meals
        .map((m) => ({ ...m, ingredients: m.ingredients.filter((i) => known.has(i.itemId) && i.servings > 0) }))
        .filter((m) => m.ingredients.length > 0),
    }));
  return { days, notes: response.parsed_output.notes };
}

/** Offline planner used when no Anthropic credentials are configured. */
export function planHeuristically(dates: string[], settings: PlanSettings, candidates: FoodItem[]) {
  const dailyBudget = settings.weeklyBudget / 7;
  const bySlot = (slot: MealSlot) => {
    const fit = candidates.filter((c) => c.tags.includes(slot));
    return fit.length ? fit : candidates;
  };
  const days: PlanDay[] = dates.map((date) => {
    const day = Number(date.slice(8)); // day of month, for variety
    return {
    date,
    meals: SLOTS.map((slot, si) => {
      const pool = bySlot(slot);
      const main = pool[(day * 3 + si * 5) % pool.length];
      const side = candidates.filter((c) => c.id !== main.id && c.nutrients.fiber >= 2)[(day + si) % 5] ?? main;
      const kcalTarget = settings.dailyCalories * SLOT_SHARE[slot];
      const kcalBoth = main.nutrients.calories + (side === main ? 0 : side.nutrients.calories);
      let servings = Math.max(0.5, Math.round((kcalTarget / Math.max(kcalBoth, 1)) * 2) / 2);
      const cost = servings * (main.price + (side === main ? 0 : side.price));
      if (cost > dailyBudget * SLOT_SHARE[slot] * 1.5) servings = Math.max(0.5, servings - 0.5);
      const ingredients = [{ itemId: main.id, servings }];
      if (side !== main) ingredients.push({ itemId: side.id, servings });
      return { slot, name: side === main ? main.name : `${main.name} with ${side.name.toLowerCase()}`, ingredients };
    }),
    };
  });
  return { days, notes: "Generated offline from the market catalog. Add ANTHROPIC_API_KEY for AI-tailored plans." };
}

export const aiEnabled = () => config.anthropicEnabled;

const STEP = 0.25; // servings move in quarter steps
const MAX_TWEAKS = 24;

/**
 * Nudges servings so each day lands within ~1% of the calorie target. Picks, one step at
 * a time, the single quarter-serving change that brings the day closest to target, and
 * stops when it's close enough or no change helps. Works on Claude's plans and the
 * offline planner's alike.
 */
export function tuneCalories(days: PlanDay[], target: number, candidates: FoodItem[]): PlanDay[] {
  const kcal = new Map(candidates.map((c) => [c.id, c.nutrients.calories]));
  const tolerance = target * 0.01;
  return days.map((day) => {
    const meals = day.meals.map((m) => ({ ...m, ingredients: m.ingredients.map((i) => ({ ...i })) }));
    const total = () => meals.reduce((s, m) => s + m.ingredients.reduce((t, i) => t + (kcal.get(i.itemId) ?? 0) * i.servings, 0), 0);
    for (let n = 0; n < MAX_TWEAKS; n++) {
      const diff = target - total();
      if (Math.abs(diff) <= tolerance) break;
      let best: { ing: { servings: number }; delta: number; gap: number } | null = null;
      for (const m of meals) {
        for (const ing of m.ingredients) {
          const per = kcal.get(ing.itemId) ?? 0;
          if (per <= 0) continue;
          const delta = diff > 0 ? STEP : -STEP;
          if (ing.servings + delta < STEP) continue; // never drop an ingredient entirely
          const gap = Math.abs(diff - per * delta);
          if (!best || gap < best.gap) best = { ing, delta, gap };
        }
      }
      if (!best || best.gap >= Math.abs(diff)) break; // no single step gets closer
      best.ing.servings = +(best.ing.servings + best.delta).toFixed(2);
    }
    return { ...day, meals };
  });
}
