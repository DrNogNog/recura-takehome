import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planHeuristically, tuneCalories } from "./planner.js";
import { EMPTY_NUTRIENTS, type FoodItem, type PlanDay } from "./types.js";

const item = (id: string, calories: number, price = 1): FoodItem => ({
  id,
  name: id,
  market: "test",
  category: "test",
  price,
  servingSize: "1",
  nutrients: { ...EMPTY_NUTRIENTS, calories },
  tags: ["breakfast", "lunch", "dinner", "snack"],
  nutrientsEstimated: false,
  updatedAt: "2026-01-01T00:00:00Z",
});

const dayKcal = (d: PlanDay, items: FoodItem[]) =>
  d.meals.reduce((s, m) => s + m.ingredients.reduce((t, i) => t + items.find((x) => x.id === i.itemId)!.nutrients.calories * i.servings, 0), 0);

test("tuneCalories brings an under-target day within 1%", () => {
  const items = [item("oats", 150), item("eggs", 140), item("rice", 170)];
  const day: PlanDay = {
    date: "2026-11-01",
    meals: [
      { slot: "breakfast", name: "b", ingredients: [{ itemId: "oats", servings: 2 }] },
      { slot: "dinner", name: "d", ingredients: [{ itemId: "rice", servings: 3 }, { itemId: "eggs", servings: 2 }] },
    ],
  }; // 1090 kcal
  const [tuned] = tuneCalories([day], 2000, items);
  assert.ok(Math.abs(dayKcal(tuned, items) - 2000) <= 20, `got ${dayKcal(tuned, items)}`);
});

test("tuneCalories trims an over-target day and never drops an ingredient", () => {
  const items = [item("salmon", 235), item("pasta", 180)];
  const day: PlanDay = {
    date: "2026-11-01",
    meals: [{ slot: "dinner", name: "d", ingredients: [{ itemId: "salmon", servings: 6 }, { itemId: "pasta", servings: 6 }] }],
  }; // 2490 kcal
  const [tuned] = tuneCalories([day], 2000, items);
  assert.ok(Math.abs(dayKcal(tuned, items) - 2000) <= 20, `got ${dayKcal(tuned, items)}`);
  assert.ok(tuned.meals[0].ingredients.every((i) => i.servings >= 0.25));
});

test("tuneCalories leaves the input plan unchanged", () => {
  const items = [item("oats", 150)];
  const day: PlanDay = { date: "2026-11-01", meals: [{ slot: "breakfast", name: "b", ingredients: [{ itemId: "oats", servings: 2 }] }] };
  tuneCalories([day], 2000, items);
  assert.equal(day.meals[0].ingredients[0].servings, 2);
});

test("offline plans from the sample market land within 1% of target after tuning", () => {
  const seed = JSON.parse(readFileSync("seed/food-market.json", "utf8")) as Array<Omit<FoodItem, "id" | "market" | "nutrientsEstimated" | "updatedAt">>;
  const items: FoodItem[] = seed.map((s, i) => ({ ...s, id: `m${i}`, market: "sample", nutrientsEstimated: false, updatedAt: "" }));
  const dates = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
  for (const target of [1600, 2000, 2600]) {
    const { days } = planHeuristically(dates, { dailyCalories: target, weeklyBudget: 75, preferences: "", tags: [] }, items);
    for (const d of tuneCalories(days, target, items)) {
      const k = dayKcal(d, items);
      assert.ok(Math.abs(k - target) <= target * 0.01, `${d.date} @ ${target}: ${Math.round(k)} kcal`);
    }
  }
});
