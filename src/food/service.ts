import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { emit } from "../automations/events.js";
import { config } from "../config.js";
import { TtlCache } from "../lib/cache.js";
import { HttpError } from "../lib/http.js";
import { parseLinks } from "../lib/links.js";
import { aiEnabled, planHeuristically, planWithClaude, tuneCalories } from "./planner.js";
import { scrapeMarket } from "./scraper.js";
import {
  DynamoFoodStore, ElasticFoodSearch, MemoryFoodSearch, MemoryFoodStore,
  type FoodSearch, type FoodStore,
} from "./stores.js";
import {
  DAILY_VALUES, EMPTY_NUTRIENTS,
  type FoodItem, type MealSlot, type Nutrients, type MealCalendar, type PlanDay, type PlanSettings,
} from "./types.js";

let store: FoodStore;
let search: FoodSearch;

// Hot reads (item search, nutrition summaries) are cached; any food update clears them.
const searchCache = new TtlCache<FoodItem[]>(5 * 60_000);
const itemCache = new TtlCache<FoodItem>(10 * 60_000, 2000);

export async function initFood() {
  if (config.foodStore === "external") {
    store = await DynamoFoodStore.connect();
    search = await ElasticFoodSearch.connect();
  } else {
    store = new MemoryFoodStore();
    search = new MemoryFoodSearch();
  }
  if ((await store.allItems()).length === 0) {
    const seed: Array<Omit<FoodItem, "id" | "market" | "nutrientsEstimated" | "updatedAt">> = JSON.parse(
      readFileSync("seed/food-market.json", "utf8")
    );
    for (const s of seed) {
      const item: FoodItem = {
        ...s,
        id: `mkt-${createHash("sha1").update(s.name).digest("hex").slice(0, 10)}`,
        market: "Recura Local Market (sample)",
        nutrientsEstimated: false,
        updatedAt: new Date().toISOString(),
      };
      await store.putItem(item);
      await search.index(item);
    }
  }
}

/** Shared market items plus `ownerId`'s personal catalog. */
export function searchItems(q: { text?: string; maxPrice?: number; tags?: string[] }, ownerId?: string) {
  const key = JSON.stringify({ ...q, ownerId });
  return searchCache.getOrSet(key, () => search.search({ ...q, ownerId }));
}

const MAX_PERSONAL_ITEMS = 300;

/**
 * Scrapes one link and adds its products to the user's personal catalog (visible only
 * to them, and used in their meal plans). Runs now rather than through the queue so
 * the page can show what was added.
 */
export async function scrapeIntoPersonalCatalog(userId: string, url: unknown) {
  if (typeof url !== "string" || !url.trim()) throw new HttpError(400, "Paste a link to a store page first");
  if (url.length > 2000) throw new HttpError(400, "That link is too long");
  return saveToPersonalCatalog(userId, await fetchProducts(userId, url));
}

/** Scrapes one page into items for `userId` (doesn't save). */
async function fetchProducts(userId: string, url: string) {
  const shared = (await store.allItems()).filter((i) => !i.ownerId);
  const found = await scrapeMarket(url, shared, userId);
  if (!found.length) {
    throw new HttpError(422, "No products with prices were found on that page. Try a product or category page from the store.");
  }
  return found;
}

/** Saves scraped items to the user's catalog, enforcing the size limit. */
async function saveToPersonalCatalog(userId: string, found: FoodItem[]) {
  const mineIds = new Set((await store.allItems()).filter((i) => i.ownerId === userId).map((i) => i.id));
  const fresh = found.filter((i) => !mineIds.has(i.id));
  if (mineIds.size + fresh.length > MAX_PERSONAL_ITEMS) {
    throw new HttpError(422, `Your personal catalog can hold ${MAX_PERSONAL_ITEMS} items. Remove some first.`);
  }
  for (const item of found) {
    await store.putItem(item);
    await search.index(item);
    itemCache.set(item.id, item);
  }
  searchCache.clear();
  return { added: fresh.length, updated: found.length - fresh.length, items: found };
}

const MAX_LINKS_PER_PASTE = 10;
const SCRAPE_CONCURRENCY = 4;

export interface LinkResult {
  url: string;
  ok: boolean;
  added?: number;
  updated?: number;
  error?: string;
}

/**
 * Scrapes every link found in pasted text (see parseLinks) into the personal catalog.
 * Pages are fetched a few at a time; results are saved in pasted order so the catalog
 * limit is applied fairly. One bad link doesn't stop the others.
 */
export async function scrapeLinksIntoPersonalCatalog(userId: string, text: unknown) {
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "Paste one or more store page links first");
  if (text.length > 20_000) throw new HttpError(400, "That's too much text. Paste up to 10 links at a time.");
  const { links, invalid } = parseLinks(text);
  if (!links.length) throw new HttpError(400, "No links found. Each link should start with https://");
  const batch = links.slice(0, MAX_LINKS_PER_PASTE);
  const skipped = links.slice(MAX_LINKS_PER_PASTE);

  // Fetch in parallel (bounded), keeping each result in its link's slot.
  const fetched: Array<{ items?: FoodItem[]; error?: string }> = new Array(batch.length);
  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const i = next++;
      try {
        fetched[i] = { items: await fetchProducts(userId, batch[i]) };
      } catch (e) {
        fetched[i] = { error: e instanceof HttpError ? e.message : "Couldn't scrape that page" };
        if (!(e instanceof HttpError)) console.error(`[scrape] ${batch[i]}`, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCRAPE_CONCURRENCY, batch.length) }, worker));

  // Save in pasted order.
  const results: LinkResult[] = [];
  for (const [i, url] of batch.entries()) {
    const f = fetched[i];
    if (f.error || !f.items) {
      results.push({ url, ok: false, error: f.error });
      continue;
    }
    try {
      const saved = await saveToPersonalCatalog(userId, f.items);
      results.push({ url, ok: true, added: saved.added, updated: saved.updated });
    } catch (e) {
      results.push({ url, ok: false, error: e instanceof HttpError ? e.message : "Couldn't save those foods" });
    }
  }
  return {
    results,
    added: results.reduce((s, r) => s + (r.added ?? 0), 0),
    updated: results.reduce((s, r) => s + (r.updated ?? 0), 0),
    failed: results.filter((r) => !r.ok).length,
    skipped, // over the per-paste limit; paste them again
    invalid, // started with http(s):// but weren't usable links
  };
}

export async function personalCatalog(userId: string) {
  return (await store.allItems()).filter((i) => i.ownerId === userId).sort((a, b) => a.name.localeCompare(b.name));
}

export async function removePersonalItem(userId: string, id: string) {
  const item = await store.getItem(id);
  if (!item || item.ownerId !== userId) throw new HttpError(404, "That item isn't in your personal catalog");
  await store.deleteItem(id);
  await search.remove(id);
  itemCache.delete(id);
  searchCache.clear();
}

async function getItem(id: string) {
  const hit = itemCache.get(id);
  if (hit) return hit;
  const item = await store.getItem(id);
  if (item) itemCache.set(id, item);
  return item;
}

// ---------- Dates ----------
// Plans are keyed by calendar date (YYYY-MM-DD). "Today" comes from the viewer's own
// clock so the calendar matches their day, but it must be within a day of the server's.
const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function resolveToday(clientToday?: unknown): string {
  const server = isoDate(new Date());
  if (typeof clientToday === "string" && DATE_RE.test(clientToday)) {
    const diff = Math.abs(Date.parse(`${clientToday}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`));
    if (diff <= DAY_MS) return clientToday;
  }
  return server;
}

function lastDayOfMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return isoDate(new Date(Date.UTC(y, m, 0)));
}

const DEFAULT_SETTINGS: PlanSettings = { dailyCalories: 2000, weeklyBudget: 75, preferences: "", tags: [] };

async function loadCalendar(userId: string): Promise<MealCalendar> {
  return (
    (await store.getCalendar(userId)) ?? {
      userId,
      days: {},
      settings: DEFAULT_SETTINGS,
      generatedBy: aiEnabled() ? "claude" : "heuristic",
      updatedAt: new Date().toISOString(),
    }
  );
}

/** One month of the calendar (plus the overflow days the grid shows), with totals per day. */
export async function getMonth(userId: string, month: string | undefined, today: string) {
  const m = month && MONTH_RE.test(month) ? month : today.slice(0, 7);
  const cal = await loadCalendar(userId);
  const from = addDays(`${m}-01`, -7);
  const to = addDays(lastDayOfMonth(m), 14);
  const days: Record<string, Awaited<ReturnType<typeof dayTotals>>> = {};
  for (const [date, d] of Object.entries(cal.days)) {
    if (date >= from && date <= to) days[date] = await dayTotals(d);
  }
  const monthDays = Object.values(days).filter((d) => d.date.startsWith(m));
  return {
    month: m,
    today,
    days,
    settings: cal.settings,
    notes: cal.notes,
    generatedBy: cal.generatedBy,
    monthTotals: {
      daysFilled: monthDays.length,
      cost: +monthDays.reduce((s, d) => s + d.cost, 0).toFixed(2),
    },
  };
}

/**
 * Fills one date, or with no date every open day from today to the end of `month`
 * (the single-click fill). Past dates can't be planned.
 */
export async function fillPlan(
  userId: string,
  input: Partial<PlanSettings> & { date?: string; month?: string; refill?: boolean },
  today: string
) {
  const cal = await loadCalendar(userId);
  const settings: PlanSettings = {
    dailyCalories: clamp(input.dailyCalories ?? cal.settings.dailyCalories, 1000, 5000),
    weeklyBudget: clamp(input.weeklyBudget ?? cal.settings.weeklyBudget, 10, 1000),
    preferences: String(input.preferences ?? cal.settings.preferences).slice(0, 500),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : cal.settings.tags,
  };

  let dates: string[];
  if (input.date !== undefined) {
    if (typeof input.date !== "string" || !DATE_RE.test(input.date)) throw new HttpError(400, "date must be YYYY-MM-DD");
    if (input.date < today) throw new HttpError(400, "Past days can't be planned");
    dates = [input.date];
  } else {
    const month = input.month && MONTH_RE.test(input.month) ? input.month : today.slice(0, 7);
    const start = `${month}-01` > today ? `${month}-01` : today;
    const end = lastDayOfMonth(month);
    if (end < today) throw new HttpError(400, "That month is already over");
    dates = [];
    for (let d = start; d <= end; d = addDays(d, 1)) if (input.refill || !cal.days[d]) dates.push(d);
  }

  if (dates.length) {
    // Retrieval step: pull the most relevant affordable items for the generator.
    const maxPrice = (settings.weeklyBudget / 7) * 0.5;
    let candidates = await searchItems({ text: settings.preferences, maxPrice, tags: settings.tags }, userId);
    if (candidates.length < 8) candidates = await searchItems({ text: settings.preferences, tags: settings.tags }, userId);
    if (!candidates.length) throw new HttpError(422, "No market items match those dietary needs");

    const habits = await eatingHabits(userId);
    let generated: { days: PlanDay[]; notes: string };
    let generatedBy: MealCalendar["generatedBy"] = "heuristic";
    if (aiEnabled()) {
      try {
        generated = await planWithClaude(dates, settings, candidates, habits.summary);
        generatedBy = "claude";
      } catch (e) {
        console.error("[food] Claude planning failed, using offline planner", e);
        generated = planHeuristically(dates, settings, candidates);
      }
    } else {
      generated = planHeuristically(dates, settings, candidates);
    }
    for (const d of tuneCalories(generated.days, settings.dailyCalories, candidates)) cal.days[d.date] = d;
    cal.notes = generated.notes;
    cal.generatedBy = generatedBy;
  }
  cal.settings = settings;
  cal.updatedAt = new Date().toISOString();
  await store.putCalendar(cal);
  if (dates.length) await announceIfOverBudget(userId, today);
  return getMonth(userId, (input.date ?? input.month ?? today).slice(0, 7), today);
}

export async function logMeal(userId: string, date: string, slot: MealSlot, eaten: boolean, today: string) {
  const cal = await loadCalendar(userId);
  const meal = cal.days[date]?.meals.find((m) => m.slot === slot);
  if (!meal) throw new HttpError(404, "That meal isn't in your plan");
  meal.eaten = eaten;
  cal.updatedAt = new Date().toISOString();
  await store.putCalendar(cal);
  if (!eaten) {
    const weekAgo = addDays(today, -6);
    const skippedThisWeek = Object.values(cal.days)
      .filter((d) => d.date >= weekAgo && d.date <= today)
      .reduce((n, d) => n + d.meals.filter((m) => m.eaten === false).length, 0);
    emit("food.meal_skipped", { ownerId: userId, subject: `${date}:${slot}`, data: { slot, mealName: meal.name, date, skippedThisWeek } });
  }
  return getMonth(userId, date.slice(0, 7), today);
}

function addNutrients(a: Nutrients, b: Nutrients, factor = 1): Nutrients {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof Nutrients>) out[k] = +(a[k] + b[k] * factor).toFixed(1);
  return out;
}

async function mealTotals(ingredients: Array<{ itemId: string; servings: number }>) {
  let nutrients = { ...EMPTY_NUTRIENTS };
  let cost = 0;
  const items: Array<{ itemId: string; name: string; servings: number; servingSize: string }> = [];
  for (const ing of ingredients) {
    const item = await getItem(ing.itemId);
    if (!item) continue;
    nutrients = addNutrients(nutrients, item.nutrients, ing.servings);
    cost += item.price * ing.servings;
    items.push({ itemId: item.id, name: item.name, servings: ing.servings, servingSize: item.servingSize });
  }
  return { nutrients, cost: +cost.toFixed(2), items };
}

/** Attaches computed nutrition and cost to each meal and the day. */
async function dayTotals(d: PlanDay) {
  let nutrients = { ...EMPTY_NUTRIENTS };
  let cost = 0;
  const meals = await Promise.all(
    d.meals.map(async (m) => {
      const t = await mealTotals(m.ingredients);
      nutrients = addNutrients(nutrients, t.nutrients);
      cost += t.cost;
      return { ...m, ...t };
    })
  );
  return { date: d.date, meals, nutrients, cost: +cost.toFixed(2) };
}

/** Macro and micronutrient report for the week ahead (today + 6 days) vs. reference values. */
export async function nutritionReport(userId: string, today: string) {
  const cal = await loadCalendar(userId);
  const end = addDays(today, 6);
  const week = await Promise.all(
    Object.values(cal.days)
      .filter((d) => d.date >= today && d.date <= end)
      .map(dayTotals)
  );
  const n = week.length;
  const range = { from: today, to: end };
  if (!n) {
    return { range, daysFilled: 0, dailyAverage: null, percentOfDailyValue: null, macroSplit: null, insights: ["Plan at least one day this week to see your nutrition."] };
  }

  const total = week.reduce((acc, d) => addNutrients(acc, d.nutrients), { ...EMPTY_NUTRIENTS });
  const weekCost = +week.reduce((s, d) => s + d.cost, 0).toFixed(2);
  const avg = {} as Nutrients;
  const pct = {} as Record<keyof Nutrients, number>;
  for (const k of Object.keys(DAILY_VALUES) as Array<keyof Nutrients>) {
    avg[k] = +(total[k] / n).toFixed(1);
    pct[k] = Math.round((avg[k] / DAILY_VALUES[k]) * 100);
  }
  const kcalFromMacros = avg.protein * 4 + avg.carbs * 4 + avg.fat * 9 || 1;
  const macroSplit = {
    protein: Math.round(((avg.protein * 4) / kcalFromMacros) * 100),
    carbs: Math.round(((avg.carbs * 4) / kcalFromMacros) * 100),
    fat: Math.round(((avg.fat * 9) / kcalFromMacros) * 100),
  };

  const insights: string[] = [];
  const target = cal.settings.dailyCalories;
  if (Math.abs(avg.calories - target) > target * 0.1) {
    insights.push(`Averaging ${Math.round(avg.calories)} kcal/day against a ${target} kcal target.`);
  }
  const low = (["fiber", "potassium", "calcium", "iron", "vitaminC"] as const).filter((k) => pct[k] < 70);
  if (low.length) insights.push(`Running low on ${low.map(label).join(", ")} (under 70% of daily value).`);
  if (pct.sodium > 100) insights.push(`Sodium is ${pct.sodium}% of the daily limit.`);
  if (macroSplit.protein < 15) insights.push("Protein is under 15% of calories; add eggs, yogurt, beans, or lean meat.");
  if (weekCost > cal.settings.weeklyBudget * (n / 7)) {
    insights.push(`Spending $${weekCost} on ${n} day(s), over the $${cal.settings.weeklyBudget}/week pace.`);
  }
  if (!insights.length) insights.push("This week's plan meets your calorie, budget, and nutrient targets.");

  return { range, daysFilled: n, dailyAverage: avg, percentOfDailyValue: pct, macroSplit, weekCost, insights };
}

/** Publishes food.plan_over_budget when the coming week's plan costs more than the budget pace. */
async function announceIfOverBudget(userId: string, today: string) {
  const report = await nutritionReport(userId, today);
  if (!report.daysFilled || report.weekCost === undefined) return;
  const cal = await loadCalendar(userId);
  const budget = +((cal.settings.weeklyBudget / 7) * report.daysFilled).toFixed(2);
  if (report.weekCost <= budget) return;
  emit("food.plan_over_budget", {
    ownerId: userId,
    subject: `week:${today}`,
    data: { weekCost: report.weekCost, budget, overBy: +(report.weekCost - budget).toFixed(2) },
  });
}

/** Estimates actual eating habits from every meal logged as eaten or skipped. */
export async function eatingHabits(userId: string) {
  const cal = await store.getCalendar(userId);
  const days = Object.values(cal?.days ?? {});
  const logged = days.flatMap((d) => d.meals.filter((m) => m.eaten !== undefined));
  const skippedBySlot: Record<string, number> = {};
  let eatenKcal = 0;
  for (const m of logged) {
    if (m.eaten) eatenKcal += (await mealTotals(m.ingredients)).nutrients.calories;
    else skippedBySlot[m.slot] = (skippedBySlot[m.slot] ?? 0) + 1;
  }
  const loggedDays = days.filter((d) => d.meals.some((m) => m.eaten !== undefined)).length;
  const adherence = logged.length ? Math.round((logged.filter((m) => m.eaten).length / logged.length) * 100) : null;
  const mostSkipped = Object.entries(skippedBySlot).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const avgEatenKcal = loggedDays ? Math.round(eatenKcal / loggedDays) : null;
  const summary = logged.length
    ? `Ate ${adherence}% of logged planned meals; about ${avgEatenKcal} kcal/day actually eaten` +
      (mostSkipped ? `; most often skips ${mostSkipped}.` : ".")
    : "No meals logged yet.";
  return { mealsLogged: logged.length, adherencePercent: adherence, avgEatenCaloriesPerDay: avgEatenKcal, mostSkippedSlot: mostSkipped, summary };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n) || lo));
const label = (k: string) => ({ vitaminC: "vitamin C" } as Record<string, string>)[k] ?? k;
